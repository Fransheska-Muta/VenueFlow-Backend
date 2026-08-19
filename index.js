require("dotenv").config();
const cors = require("cors");
const express = require("express");
const axios = require("axios");
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
app.use(express.json());

// MongoDB connection setup  
const uri = process.env.MONGODB_URI;
const { MongoClient, ObjectId} = require("mongodb");
// const base64 = require("base-64"); Here is where we use firebase
let client;
let db;

// Function to connect to MongoDB
async function connectToDatabase() {
  client = new MongoClient("mongodb://mutafransheska45_db_user:5rVMsR3IuUzDxesL@ac-qf5otbx-shard-00-00.trertll.mongodb.net:27017,ac-qf5otbx-shard-00-01.trertll.mongodb.net:27017,ac-qf5otbx-shard-00-02.trertll.mongodb.net:27017/?ssl=true&replicaSet=atlas-13vop3-shard-0&authSource=admin&appName=Venue-Flow"); 
  await client.connect();
  db = client.db("VenueFlow");
}

// Endpoint to handle user signup
app.post("/signup", async (req, res) => {
  try{
    const user = req.body;
  if(!user.uid)
    throw new Error("Missing Firebase UID");
  if(!user.username)
    throw new Error("Username is missing");
  if(!user.email)
    throw new Error("Email is missing");

  const collection = db.collection("users");
  const existingUser= await collection.findOne({uid: user.uid});
  if(existingUser){
    return res.status(400).json({message: "User already exists"});
  }

  // Every users starts as a normal user
  user.role = "user";
  const result = await collection.insertOne({
    ...user, createdAt: new Date()
  });
  res.status(201).json({
    message: "Account created successfully",
    userId: result.insertedId,
  });
}catch(error) {
    console.error(error);
    res.status(400).json({
    message: error.message
  });
}
});

const auth = require("./firebaseAdmin")
async function verifyFirebase(req, res, next) {
    // console.log("verifyFirebase was called");
    const header = req.headers.authorization;
    if (!header) {
        return res.status(401).json({
            message: "No token"
        });
    }
    const token = header.split(" ")[1];
    try {
        const decoded =await auth.verifyIdToken(token);
        req.uid = decoded.uid;
        next();
    }
catch (error) {
    // console.error("Firebase token verification error:", error);
    return res.status(401).json({message: "Invalid token"});
}
}

app.get("/users/:uid", async (req, res) => {
    const collection = db.collection("users");
    const user = await collection.findOne({
        uid: req.params.uid
    });
    if (!user) {
        return res.status(404).json({message: "User not found"});
    }
    res.json(user);
});


//this gets all users who have roles of manager only and puts them in the table on the superadmin dashboard
app.get("/users", verifyFirebase, async (req, res) => {
    try {
        const collection = db.collection("users");
        // Find the currently logged-in user
        const currentUser = await collection.findOne({uid: req.uid});
        // Only superAdmins can view the users
        if (!currentUser || currentUser.role !== "superAdmin") {
            return res.status(403).json({message: "Access Denied"});
        }
        // getting only managers and superAdmin users
        const users = await collection.find(
            {role: {$in: ["manager", "superAdmin"]}},
            {projection: {username: 1, name: 1, email: 1, role: 1}}
        ).toArray();
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({message: "Internal Server Error"});
    }
});

// so that the superadmin can promote users
app.put("/users/promote", verifyFirebase, async (req, res) => {
    try {
        const collection = db.collection("users");
        // finding the person making the request
        const currentUser = await collection.findOne({uid: req.uid});
        // only superAdmins can promote users
        if (!currentUser || currentUser.role !== "superAdmin") {
            return res.status(403).json({message: "Access Denied"});
        }
        // get email and role from frontend
        const { email, role } = req.body;
        if (!email || !role) {
            return res.status(400).json({message: "Email and role are required"});
        }
        // only allow these roles
        if (!["manager", "superAdmin"].includes(role)) {
            return res.status(400).json({message: "Invalid role selected"});
        }

        // finding the user using their email
        const user = await collection.findOne({email: email.toLowerCase()});
        if (!user) {
            return res.status(404).json({message: "User with that email was not found"});
        }
        if (user.role === "superAdmin") {
            return res.status(400).json({message: "You cannot change a superAdmin's role"});
        }

        // chaing the users role
        const result = await collection.updateOne(
            { _id: user._id },
            {$set: {role: role}}
        );
        if (result.modifiedCount === 0) {
            return res.status(400).json({message: "User role was not changed"});
        }
        res.json({message: `User promoted to ${role} successfully`});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: error.message});
    }
});

// remove a user's special role and return them to a normal user
app.put("/users/:id/demote", verifyFirebase, async (req, res) => {
    try {
        const collection = db.collection("users");
        // finding the person making the request
        const currentUser = await collection.findOne({uid: req.uid});
        // only superAdmins can remove roles
        if (!currentUser || currentUser.role !== "superAdmin") {
            return res.status(403).json({message: "Access Denied"});
        }
        const { id } = req.params;
        // making sure the MongoDB id is valid
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({message: "Invalid user ID"});
        }
        // preventing the superAdmin from removing their own role
        if (currentUser._id.toString() === id) {
            return res.status(400).json({message: "You cannot remove your own superAdmin role."});
        }
        // changing the user's role back to normal user
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "user" } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({message: "User not found"});
        }
        res.json({message: "User role removed successfully"});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: error.message});
    }
});

// endpoint to post events
app.post("/events", verifyFirebase, async (req, res) => {
    try {
        //getting the user's Firebase UID
        const uid = req.uid;
        //finding the user in our database
        const user = await db.collection("users").findOne({ uid });
        //checling if they exist
        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }
        //so that ONLY managers can create events
        if (user.role !== "manager") {
            return res.status(403).json({
                message: "Only managers can create events."
            });
        }
        const event = req.body;
        if ( !event.name || !event.description || !event.venueId || !event.date || !event.startTime || !event.ticketSales || !event.ticketSalesClosingDate) {
    return res.status(400).json({
        message: "Please provide all required event information."
    });
}
        const collection = db.collection("events");
        const result = await collection.insertOne({
            ...event,
            //storing the person who created the event
            createdBy: uid,
            createdAt: new Date()
        })
        res.status(201).json({
            message: "Event created successfully",
            eventId: result.insertedId
        });

    } catch (error) {
        console.error(error);
        res.status(400).json({message: error.message});
    }
});
//  endpoint to get events
app.get("/events",verifyFirebase, async (req, res) => {
    try {
        const collection = db.collection("events");
        const events = await collection.find({}).toArray();
        res.status(200).json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({message: error.message})
    }
});

// endpoint to update events
app.put("/events/:id", verifyFirebase, async (req, res) => {
    try {
        const { id } = req.params;
        const event = req.body;
        const collection = db.collection("events");
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...event, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({message: "Event not found"});
        }
        res.json({
            message: "Event updated successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to delete events
app.delete("/events/:id", verifyFirebase, async (req, res) => {
    try {
        const { id } = req.params;
        const collection = db.collection("events");
        const result = await collection.deleteOne({_id: new ObjectId(id)});
        if (result.deletedCount === 0) {
          return res.status(404).json({
            message: "Event not found"
          });
        }
        res.status(200).json({
          message: "Event deleted successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
          message: error.message
        });
    }
});

// endpoint to get venues
app.get("/venues", verifyFirebase, async (req, res) => {
    try {
        const collection = db.collection("venues");
        const venues = await collection.find({}).toArray();
        res.json(venues);
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
}); 

// endpoint to post venues
app.post("/venues", verifyFirebase, async (req, res) => {
     console.log("VENUES ENDPOINT WAS HIT");
    try {
        const venue = req.body;
        const collection = db.collection("venues");
        const result = await collection.insertOne({...venue, createdAt: new Date()});
        res.status(201).json({
            message: "Venue created successfully",
            venueId: result.insertedId
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to update venues
app.put("/venues/:id", verifyFirebase, async (req, res) => {
    try {
        const { ObjectId } = require("mongodb");
        const venueId = req.params.id;
        const updatedVenue = req.body;
        const collection = db.collection("venues");
        const result = await collection.updateOne(
            { _id: new ObjectId(venueId)},
            { $set: {name: updatedVenue.name,
                    description: updatedVenue.description,
                    address: updatedVenue.address,
                    capacity: updatedVenue.capacity,
                    rows: updatedVenue.rows,
                    seatsPerRow: updatedVenue.seatsPerRow}})
        if (result.matchedCount === 0) {return res.status(404).json({
            message: "Venue not found"
         });
        }res.status(200).json({
            message: "Venue updated successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: error.message});
    }
});

// endpoint to delete venues
app.delete("/venues/:id", verifyFirebase, async (req, res) => {
    try {
        const { ObjectId } = require("mongodb");
        const venueId = req.params.id;
        const collection = db.collection("venues");
        const result = await collection.deleteOne({
            _id: new ObjectId(venueId)
        });
        if (result.deletedCount === 0) {
            return res.status(404).json({message: "Venue not found"})
        }
        res.status(200).json({
            message: "Venue deleted successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: error.message
        });
    }
});

// endpoint to post bookings
// app.post("/bookings", async (req, res) => {
//     try {
//         const booking = req.body;
//         const collection = db.collection("bookings");
//         const result = await collection.insertOne({...booking, createdAt: new Date()});
//         res.status(201).json({
//             message: "Booking created successfully",
//             bookingId: result.insertedId
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(400).json({
//             message: error.message
//         });
//     }
// });

// endpoint to post bookings (David's implementation)

app.get("/bookings", verifyFirebase, async (req, res) => {
    try{
        const {eventId, vanueId, selectedSeats } = req.body;
        const userId = req.user._id;

        if(!eventId || !venueId || !selectedSeats || !Array.isArray(selectedSeats) || selectedSeats.length === 0){
            return res.status(400).json({message: "Missing or malformed payload fields."});
        }
        if (!ObjectId.isValid(eventId) || !ObjectId.isValid(venueId)) {
            return res.status(400).json({message: "Invalid eventId or venueId."});
        }
        const seatCollection = db.collection("seats");
        const bookingCollection = db.collection("bookings");

        const seatObjectIds = selectedSeats.map(id=>{
            if(!ObjectId.isValid(id)){
                throw new Error(`Invalid seat ID: ${id}`);
            }
            return new ObjectId(id);
        });

        const dbSeats =await seatCollextion.find({
            _id: {$in: seatObjectIds},
            eventId: new ObjectId(eventId),
        }).toArray();

        if(dbSeats.length !== selectedSeats.length){
            return res.status(400).json({message: "Some selected seats do not exist for the given event."});
        }

        const isAnySeatTaken = dbSeats.some(seat =>seat.status !== "available");
        if(isAnySeatTaken){
            return res.status(400).json({message: "One or more selected seats are already booked."});
        }

        let calculatedTotal = 0;
        dbSeats.forEach(seat=>{
            calculatedTotal += seat.price;
        });

        const bookingReference = `VenueFlow-${Math.random().toString(36).substr(2, 9)}.toUpperCase()`;

        const newBooking = {
            customer_id: new ObjectId(userId),
            event_id: new ObjectId(eventId),
            venue_id: new ObjectId(venueId),
            selectedSeats: seatObjectIds,
            totalPrice: calculatedTotal,
            bookingReference: bookingReference,
            bookingStatus: "confirmed",
            createdAt: new Date(),
        };

        const result = await bookingCollection.insertOne(newBooking);
        await seatCollection.updateMany(
            {_id: {$in: seatObjectIds}},
            {$set: {status: "booked", updatedByBooking: result.insertedId}}
        );
        return res.status(201).json({
            message: "Booking created successfully",
            bookingId: result.insertedId,
            totalPrice: calculatedTotal,
            bookingReference: bookingReference,
            bookingStatus: newBooking.bookingStatus
        });
    } catch (error){
        console.error(error);
        return res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to get bookings history

app.get("/bookings", verifyFirebase, async (req, res) => {
    try {
        const collection = db.collection("bookings");
        const bookings = await collection.find({}).toArray();
        res.json(bookings);
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});


app.post('/api/book-seat', verifyFirebase, async (req, res) => {
  const { eventId, seatId, userId } = req.body;

  //  Look up if this seat has already been saved in Firebase
  const seatRef = db.collection('events').doc(eventId).collection('bookings').doc(seatId);
  const seatSnapshot = await seatRef.get();

  if (seatSnapshot.exists) {
    const seatData = seatSnapshot.data();

    if (seatData.status === 'booked') {
      // If Customer B hits this, we stop them immediately and send an error message
      return res.status(409).json({ 
        success: false, 
        message: "Too late! This seat is already booked by someone else." 
      });
    }
  }

  //  If it's not booked, save it for this user!
  await seatRef.set({
    status: 'booked',
    bookedBy: userId,
    bookedAt: new Date()
  });

  return res.status(200).json({ 
    success: true, 
    message: "Seat successfully booked!" 
  });
});



// endpoint to post payments
app.post("/payments", verifyFirebase, async (req, res) => {
    try {
        const payment = req.body;
        const collection = db.collection("payments");
        const result = await collection.insertOne({...payment, createdAt: new Date()});
        res.status(201).json({
            message: "Payment created successfully",
            paymentId: result.insertedId
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

app.listen(PORT, async () => {
  await connectToDatabase();
  console.log(`Server is running on port ${PORT}`);
});

