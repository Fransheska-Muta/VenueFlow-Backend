require("dotenv").config();
const cors = require("cors");
const express = require("express");
const axios = require("axios");
const app = express();
app.use(cors())

const PORT = process.env.PORT || 3000;
app.use(express.json());

// MongoDB connection setup
const uri = process.env.MONGODB_URI;
const { MongoClient, ObjectId } = require("mongodb");
// const base64 = require("base-64"); Here is where we use firebase
let client;
let db;

// Function to connect to MongoDB
async function connectToDatabase() {
  client = new MongoClient(
    "mongodb://mutafransheska45_db_user:5rVMsR3IuUzDxesL@ac-qf5otbx-shard-00-00.trertll.mongodb.net:27017,ac-qf5otbx-shard-00-01.trertll.mongodb.net:27017,ac-qf5otbx-shard-00-02.trertll.mongodb.net:27017/?ssl=true&replicaSet=atlas-13vop3-shard-0&authSource=admin&appName=Venue-Flow",
  );
  await client.connect();
  db = client.db("VenueFlow");
}

// Endpoint to handle user signup
app.post("/signup", async (req, res) => {
  try {
    const user = req.body;
    if (!user.uid) throw new Error("Missing Firebase UID");
    if (!user.username) throw new Error("Username is missing");
    if (!user.email) throw new Error("Email is missing");

    const collection = db.collection("users");
    const existingUser = await collection.findOne({ uid: user.uid });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Every users starts as a normal user
    user.role = "user";
    const result = await collection.insertOne({
      ...user,
      createdAt: new Date(),
    });
    res.status(201).json({
      message: "Account created successfully",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: error.message,
    });
  }
});

const auth = require("./firebaseAdmin");
async function verifyFirebase(req, res, next) {
  // console.log("verifyFirebase was called");
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({
      message: "No token",
    });
  }
  const token = header.split(" ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (error) {
    // console.error("Firebase token verification error:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
}

// handles login
app.get("/users/:uid", async (req, res) => {
  try {
    const collection = db.collection("users");
    const user = await collection.findOne({ uid: req.params.uid });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//this gets all users who have roles of manager only and puts them in the table on the superadmin dashboard
app.get("/users", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("users");
    // Find the currently logged-in user
    const currentUser = await collection.findOne({ uid: req.uid });
    // Only superAdmins can view the users
    if (!currentUser || currentUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Access Denied" });
    }
    // getting only managers and superAdmin users
    const users = await collection
      .find(
        { role: { $in: ["manager", "superAdmin"] } },
        { projection: { username: 1, name: 1, email: 1, role: 1 } },
      )
      .toArray();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// so that the superadmin can promote users
app.put("/users/promote", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("users");
    // finding the person making the request
    const currentUser = await collection.findOne({ uid: req.uid });
    // only superAdmins can promote users
    if (!currentUser || currentUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Access Denied" });
    }
    // get email and role from frontend
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required" });
    }
    // only allow these roles
    if (!["manager", "superAdmin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    // finding the user using their email
    const user = await collection.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User with that email was not found" });
    }
    if (user.role === "superAdmin") {
      return res
        .status(400)
        .json({ message: "You cannot change a superAdmin's role" });
    }

    // chaing the users role
    const result = await collection.updateOne(
      { _id: user._id },
      { $set: { role: role } },
    );
    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: "User role was not changed" });
    }
    res.json({ message: `User promoted to ${role} successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// remove a user's special role and return them to a normal user
app.put("/users/:id/demote", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("users");
    // finding the person making the request
    const currentUser = await collection.findOne({ uid: req.uid });
    // only superAdmins can remove roles
    if (!currentUser || currentUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Access Denied" });
    }
    const { id } = req.params;
    // making sure the MongoDB id is valid
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    // preventing the superAdmin from removing their own role
    if (currentUser._id.toString() === id) {
      return res
        .status(400)
        .json({ message: "You cannot remove your own superAdmin role." });
    }
    // changing the user's role back to normal user
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: "user" } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User role removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
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
        message: "User not found.",
      });
    }
    //so that ONLY managers can create events
    if (user.role !== "manager") {
      return res.status(403).json({
        message: "Only managers can create events.",
      });
    }
    const event = req.body;
    if (
      !event.name ||
      !event.description ||
      !event.venueId ||
      !event.date ||
      !event.startTime ||
      !event.ticketSales ||
      !event.ticketSalesClosingDate
    ) {
      return res.status(400).json({
        message: "Please provide all required event information.",
      });
    }
    const collection = db.collection("events");
    const result = await collection.insertOne({
      ...event,
      //storing the person who created the event
      createdBy: uid,
      createdAt: new Date(),
    });
    res.status(201).json({
      message: "Event created successfully",
      eventId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});


//  endpoint to get events
app.get("/events", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("events");
    const events = await collection.find({}).toArray();
    res.status(200).json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
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
      { $set: { ...event, updatnodeedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json({
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: error.message,
    });
  }
});

// endpoint to delete events
app.delete("/events/:id", verifyFirebase, async (req, res) => {
  try {
    const { id } = req.params;
    const collection = db.collection("events");
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }
    res.status(200).json({
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: error.message,
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
      message: error.message,
    });
  }
});

// endpoint to post venues
app.post("/venues", verifyFirebase, async (req, res) => {
  // console.log("VENUES ENDPOINT WAS HIT");
  try {
    const venue = req.body;
    const collection = db.collection("venues");
    const result = await collection.insertOne({
      ...venue,
      createdAt: new Date(),
    });
    res.status(201).json({
      message: "Venue created successfully",
      venueId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: error.message,
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
      { _id: new ObjectId(venueId) },
      {
        $set: {
          name: updatedVenue.name,
          description: updatedVenue.description,
          address: updatedVenue.address,
          capacity: updatedVenue.capacity,
          rows: updatedVenue.rows,
          seatsPerRow: updatedVenue.seatsPerRow,
        },
      },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Venue not found",
      });
    }
    res.status(200).json({
      message: "Venue updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// endpoint to delete venues
app.delete("/venues/:id", verifyFirebase, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const venueId = req.params.id;
    const collection = db.collection("venues");
    const result = await collection.deleteOne({
      _id: new ObjectId(venueId),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Venue not found" });
    }
    res.status(200).json({
      message: "Venue deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: error.message,
    });
  }
});

// 1. GET EVENT LAYOUT & SEATS
app.post("/events/:eventId/book-seat", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { seatId, userId } = req.body; // e.g., seatId = "A12"

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }

    const eventsCollection = db.collection("events");
    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const venueId = event.venueId;
    if (!venueId) {
      return res
        .status(400)
        .json({ message: "This event does not have a venue assigned." });
    }

    // 1. Fetch layout rules from the venues collection
    const venuesCollection = db.collection("venues");
    const venue = await venuesCollection.findOne({
      _id: new ObjectId(venueId),
    });

    if (!venue || !venue.rows || !venue.seatsPerRow) {
      return res
        .status(404)
        .json({ message: "Venue layout configuration parameters not found." });
    }

    // 2. Validate if the requested seat identifier matches the physical layout grid rules
    // Extracts row letters and seat numbers (e.g., "A12" -> row: "A", number: 12)
    const match = seatId.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return res
        .status(400)
        .json({ message: "Invalid seat format structure." });
    }

    const rowLetter = match[1];
    const seatNum = parseInt(match[2], 10);

    // Convert row letter back to a number index (A=1, B=2, etc.)
    const rowNum = rowLetter.charCodeAt(0) - 64;

    if (
      rowNum < 1 ||
      rowNum > venue.rows ||
      seatNum < 1 ||
      seatNum > venue.seatsPerRow
    ) {
      return res
        .status(400)
        .json({ message: "Seat is outside of physical venue boundaries." });
    }

    // Initialize the event's dynamic bookings array if it doesn't exist yet
    const currentBookings = event.seats || [];
    const existingSeatRecord = currentBookings.find((s) => s.id === seatId);

    let updatedStatus = "locked";
    let lockedBy = userId;
    let action = "locked";

    if (existingSeatRecord) {
      if (existingSeatRecord.status === "booked") {
        return res.status(409).json({ message: "Seat permanently booked." });
      }

      if (existingSeatRecord.status === "locked") {
        if (existingSeatRecord.lockedBy === userId) {
          // unlock if the same user clicks it again
          updatedStatus = "available";
          lockedBy = null;
          action = "unlocked";
        } else {
          return res
            .status(409)
            .json({ message: "Seat held by another user." });
        }
      }
    }

    // 3. Persist the seat state directly inside the events collection
    if (!existingSeatRecord) {
      // First time this seat is interacting with this specific event
      await eventsCollection.updateOne(
        { _id: new ObjectId(eventId) },
        {
          $push: {
            seats: { id: seatId, status: updatedStatus, lockedBy: lockedBy },
          },
        },
      );
    } else {
      // Update the existing state within the event document array
      await eventsCollection.updateOne(
        { _id: new ObjectId(eventId), "seats.id": seatId },
        {
          $set: {
            "seats.$.status": updatedStatus,
            "seats.$.lockedBy": lockedBy,
          },
        },
      );
    }

    return res
      .status(200)
      .json({ action, message: `Status updated to: ${updatedStatus}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route to your Express backend server file (e.g., app.js or server.js)
app.get("/events/:eventId/seats", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID structure." });
    }

    // 1. Find the target event
    const eventsCollection = db.collection("events");
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });

    if (!event) {
      return res.status(404).json({ message: "Requested event could not be found." });
    }

    // 2. Extract the linked venue ID 
    const venueId = event.venueId;
    if (!venueId) {
      return res.status(400).json({ message: "This event does not have an assigned venue layout." });
    }

    // 3. Find the venue matching parameters (rows and seatsPerRow)
    const venuesCollection = db.collection("venues");
    const venue = await venuesCollection.findOne({ _id: new ObjectId(venueId) });

    if (!venue || !venue.rows || !venue.seatsPerRow) {
      return res.status(404).json({ message: "The structural dimensions for this venue are missing." });
    }

    // 4. Send back a combined JSON payload that aligns perfectly with your React component
    return res.status(200).json({
      _id: event._id,
      name: event.name,
      venueId: venueId,
      rows: venue.rows,                  // Sent down to feed the frontend grid generator loop
      seatsPerRow: venue.seatsPerRow,    // Sent down to feed the CSS column rule layout
      seats: event.seats || []           // Merges active seat booking status arrays
    });

  } catch (error) {
    console.error("Backend Layout Fetch Crash:", error);
    return res.status(500).json({ message: "Internal server error occurred." });
  }
});




// endpoint to post bookings (David's implementation)
app.post("/bookings", async (req, res) => {
  try {
    const { eventId, venueId, selectedSeats } = req.body;
    const userId = req.user?._id; // Ensure your auth middleware sets req.user

    if (
      !eventId ||
      !venueId ||
      !selectedSeats ||
      !Array.isArray(selectedSeats) ||
      selectedSeats.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "Missing or malformed payload fields." });
    }
    if (
      !ObjectId.isValid(eventId) ||
      !ObjectId.isValid(venueId) ||
      !ObjectId.isValid(userId)
    ) {
      return res
        .status(400)
        .json({ message: "Invalid payload identification IDs." });
    }

    const eventsCollection = db.collection("events");
    const bookingsCollection = db.collection("bookings");

    // Fetch the target event containing the nested seats array
    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });
    if (!event || !event.seats) {
      return res
        .status(404)
        .json({ message: "Event layout not initialized or found." });
    }

    // Verify selected seats match and are currently held by this user
    const matchingSeats = event.seats.filter((s) =>
      selectedSeats.includes(s.id),
    );

    if (matchingSeats.length !== selectedSeats.length) {
      return res
        .status(400)
        .json({ message: "Some selected seats do not exist in the layout." });
    }

    const verificationFailed = matchingSeats.some(
      (s) => s.status !== "locked" || String(s.lockedBy) !== String(userId),
    );
    if (verificationFailed) {
      return res.status(400).json({
        message: "One or more seats are no longer locked by your session.",
      });
    }

    // 4. Calculate total cost using a standard pricing fallback token
    const seatPrice = event.ticketPrice; // Use event pricing or fallback base price
    const calculatedTotal = matchingSeats.length * seatPrice;

    // Generate a clean random booking reference hash string uppercase
    const randomHash = Math.random()
      .toString(36)
      .substring(2, 11)
      .toUpperCase();
    const bookingReference = `NOVUS-${randomHash}`;

    // Save structural registration details inside the bookings collection
    const newBooking = {
      customer_id: new ObjectId(userId),
      event_id: new ObjectId(eventId),
      venue_id: new ObjectId(venueId),
      seats: selectedSeats, // Stores array strings ['A1', 'A2']
      totalPrice: calculatedTotal,
      bookingReference: bookingReference,
      bookingStatus: "confirmed",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);

    // Loop updates to flip targeted seats inside the event array cleanly from locked to booked
    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $set: {
          "seats.$[elem].status": "booked",
          "seats.$[elem].lockedBy": null,
          "seats.$[elem].bookingId": result.insertedId,
        },
      },
      {
        arrayFilters: [{ "elem.id": { $in: selectedSeats } }],
      },
    );

    return res.status(201).json({
      message: "Booking created successfully",
      bookingId: result.insertedId,
      totalPrice: calculatedTotal,
      bookingReference: bookingReference,
      bookingStatus: "confirmed",
    });
  } catch (error) {
    console.error("Booking transactional fault:", error);
    return res.status(500).json({ message: error.message });
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
      message: error.message,
    });
  }
});

// endpoint to post payments
app.post("/payments", async (req, res) => {
  try {
    const payment = req.body;
    const collection = db.collection("payments");
    const result = await collection.insertOne({
      ...payment,
      createdAt: new Date(),
    });
    res.status(201).json({
      message: "Payment created successfully",
      paymentId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: error.message,
    });
  }
});

async function startServer() {
  try {
    await connectToDatabase()
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Connected to MongoDB");
    })
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}
startServer()
