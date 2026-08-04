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
  console.log(uri);
  client = new MongoClient("mongodb://mutafransheska45_db_user:5rVMsR3IuUzDxesL@ac-qf5otbx-shard-00-00.trertll.mongodb.net:27017,ac-qf5otbx-shard-00-01.trertll.mongodb.net:27017,ac-qf5otbx-shard-00-02.trertll.mongodb.net:27017/?ssl=true&replicaSet=atlas-13vop3-shard-0&authSource=admin&appName=Venue-Flow"); 
  await client.connect();
  db = client.db("VenueFlow");
}

// Middleware for Basic Authentication
async function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401)
    .json({ message: "Missing or invalid Authorization header" });
  }

  // Split the credentials into user/password using Firebase
//   const base64Credentials = authHeader.split(" ")[1];
//   const credentials = base64.decode(base64Credentials).split(":");
//   const email = credentials[0];
//   const password = credentials[1];

  // Read MongoDB
  const collection = db.collection("users");
  const user = await collection.findOne({ email });

  // if user not found
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  // Decode and check the password using firebase
//   const decodeStoredPassword = base64.decode(user.password);
//   if (decodeStoredPassword !== password) {
//     return res.status(401).json({ message: "Invalid password" });
//   }
  req.user = user;
  next();
}

// Endpoint to handle user signup
app.post("/signup", async (req, res) => {
  try{
    const user = req.body;
  // validate user input
  if(user.password.length < 8)
    throw new Error("Password must be at least 8 characters long");
  if(!user.email.includes("@"))
    throw new Error("Invalid email format");
  if(user.password !== user.confirmPassword)
    throw new Error("Passwords do not match");
  
  // remove confirmPassword field before storing in database
  delete user.confirmPassword;
  
  // Every users starts as a normal user
  user.role = "user";

  // encode password before storing, it means hiding the password before stroing it
//   user.password = base64.encode(user.password);

  // add user to database
  const collection = db.collection("users");
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

app.use(basicAuth);

app.post("/login", async (req, res) => {
    res.json({
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
    });
});

// tHis is so that the superAdmin can see all users but their password is removed for safety
app.get("/users", async (req, res) => {
    if (req.user.role !== "superAdmin") {
        return res.status(403).json({
            message: "Access Denied"
        });
    }
    const collection = db.collection("users");
    const users = await collection.find(
        {},
        {
            projection: {
                password: 0
            }
        }
    ).toArray();
    res.json(users);
});

// so that the superadmin can promote users
app.put("/users/:id/promote",async (req, res) => {

   console.log("Promote is workingggggg");

    if (req.user.role !== "superAdmin") {
        return res.status(403).json({
            message: "Access Denied"
        });
    }
    const { id } = req.params;
    // to make sure the id is valid
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({
            message: "Invalid user ID"
        });
    }
    const collection = db.collection("users");
    const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: {
            role: "municipality"
        }
      }
  );
    if (result.matchedCount === 0) {
        return res.status(404).json({
            message: "User not found"
        });
    }
    res.json({
        message: "User promoted successfully"
    });
});

// endpoint to post events
app.post("/events", async (req, res) => {
    try {
        const event = req.body;
        const collection = db.collection("events");
        const result = await collection.insertOne({...event, createdAt: new Date()});
        res.status(201).json({
            message: "Event created successfully",
            eventId: result.insertedId
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

//  endpoint to get events
app.get("/events", async (req, res) => {
    try {
        const collection = db.collection("events");
        const events = await collection.find({}).toArray();
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to update events
app.put("/events/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const event = req.body;
        const collection = db.collection("events");
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...event, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: "Event not found"
            });
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
app.delete("/events/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const collection = db.collection("events");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });      
        if (result.deletedCount === 0) {
            return res.status(404).json({
                message: "Event not found"
            });
        }
        res.json({
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
app.get("/venues", async (req, res) => {
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
app.post("/venues", async (req, res) => {
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
app.put("/venues/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const venue = req.body;
        const collection = db.collection("venues");
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...venue, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: "Venue not found"
            });
        }
        res.json({
            message: "Venue updated successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to delete venues
app.delete("/venues/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const collection = db.collection("venues");
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({
                message: "Venue not found"
            });
        }
        res.json({
            message: "Venue deleted successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to post bookings
app.post("/bookings", async (req, res) => {
    try {
        const booking = req.body;
        const collection = db.collection("bookings");
        const result = await collection.insertOne({...booking, createdAt: new Date()});
        res.status(201).json({
            message: "Booking created successfully",
            bookingId: result.insertedId
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: error.message
        });
    }
});

// endpoint to get bookings history
app.get("/bookings", async (req, res) => {
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

// endpoint to post payments
app.post("/payments", async (req, res) => {
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
    }p
});

app.listen(PORT, async () => {
  await connectToDatabase();
  console.log(`Server is running on port ${PORT}`);
});

