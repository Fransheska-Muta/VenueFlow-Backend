require("dotenv").config();
const cors = require("cors");
const express = require("express");
const axios = require("axios");
const app = express();
const fs = require("fs");
const path = require("path");
app.use(cors());

const PORT = process.env.PORT || 3000;
app.use(express.json());

// MongoDB connection setup
const uri = process.env.MONGODB_URI;
const { MongoClient, ObjectId } = require("mongodb");
let client;
let db;

// Function to connect to MongoDB
async function connectToDatabase() {
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  client = new MongoClient(uri);
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
    return res.status(401).json({ message: "Invalid token" });
  }
}

// Small helper: given a request that has already passed verifyFirebase
// (so req.uid is set), fetch the corresponding Mongo user document.
// Centralizing this avoids every route re-deriving userId differently.
async function getMongoUserOrFail(req, res) {
  const authUser = await db.collection("users").findOne({ uid: req.uid });
  if (!authUser) {
    res.status(404).json({ message: "User not found." });
    return null;
  }
  return authUser;
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

app.get("/users", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("users");
    const currentUser = await collection.findOne({ uid: req.uid });
    if (!currentUser || currentUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Access Denied" });
    }
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

app.put("/users/promote", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("users");
    const currentUser = await collection.findOne({ uid: req.uid });
    if (!currentUser || currentUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Access Denied" });
    }
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required" });
    }
    if (!["manager", "superAdmin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

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

app.put("/users/:id/demote", verifyFirebase, async (req, res) => {
  try {
    const collection = db.collection("users");
    const currentUser = await collection.findOne({ uid: req.uid });
    if (!currentUser || currentUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Access Denied" });
    }
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    if (currentUser._id.toString() === id) {
      return res
        .status(400)
        .json({ message: "You cannot remove your own superAdmin role." });
    }
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
    const uid = req.uid;
    const user = await db.collection("users").findOne({ uid });
    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }
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

app.put("/events/:id", verifyFirebase, async (req, res) => {
  try {
    const { id } = req.params;
    const event = req.body;
    const collection = db.collection("events");
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...event, updatedAt: new Date() } },
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

app.post("/venues", verifyFirebase, async (req, res) => {
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

app.put("/venues/:id", verifyFirebase, async (req, res) => {
  try {
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

app.delete("/venues/:id", verifyFirebase, async (req, res) => {
  try {
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

// ---------------------------------------------------------------------
// SEATING / BOOKING FLOW
// Both routes below now require a verified Firebase token, and derive
// the acting user's Mongo _id from that token server-side. Nothing about
// "who is making this request" is ever trusted from the request body —
// that's what was breaking /bookings before (it expected req.user, which
// nothing ever set, so the ObjectId.isValid(userId) check always failed).
// ---------------------------------------------------------------------

// 1. LOCK / UNLOCK A SEAT
app.post("/events/:eventId/book-seat", verifyFirebase, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { seatId } = req.body; // e.g., seatId = "A12"

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }

    const authUser = await getMongoUserOrFail(req, res);
    if (!authUser) return; // response already sent
    const userId = authUser._id.toString();

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

    const venuesCollection = db.collection("venues");
    const venue = await venuesCollection.findOne({
      _id: new ObjectId(venueId),
    });

    if (!venue || !venue.rows || !venue.seatsPerRow) {
      return res
        .status(404)
        .json({ message: "Venue layout configuration parameters not found." });
    }

    const match = seatId.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return res
        .status(400)
        .json({ message: "Invalid seat format structure." });
    }

    const rowLetter = match[1];
    const seatNum = parseInt(match[2], 10);
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
        if (String(existingSeatRecord.lockedBy) === userId) {
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

    if (!existingSeatRecord) {
      await eventsCollection.updateOne(
        { _id: new ObjectId(eventId) },
        {
          $push: {
            seats: { id: seatId, status: updatedStatus, lockedBy: lockedBy },
          },
        },
      );
    } else {
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

// 2. GET EVENT LAYOUT & SEATS
app.get("/events/:eventId/seats", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID structure." });
    }

    const eventsCollection = db.collection("events");
    const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });

    if (!event) {
      return res.status(404).json({ message: "Requested event could not be found." });
    }

    const venueId = event.venueId;
    if (!venueId) {
      return res.status(400).json({ message: "This event does not have an assigned venue layout." });
    }

    const venuesCollection = db.collection("venues");
    const venue = await venuesCollection.findOne({ _id: new ObjectId(venueId) });

    if (!venue || !venue.rows || !venue.seatsPerRow) {
      return res.status(404).json({ message: "The structural dimensions for this venue are missing." });
    }

    return res.status(200).json({
      _id: event._id,
      name: event.name,
      venueId: venueId,
      rows: venue.rows,
      seatsPerRow: venue.seatsPerRow,
      seats: event.seats || [],
    });

  } catch (error) {
    console.error("Backend Layout Fetch Crash:", error);
    return res.status(500).json({ message: "Internal server error occurred." });
  }
});

// 3. CONFIRM BOOKING (direct, non-Paystack path)
app.post("/bookings", verifyFirebase, async (req, res) => {
  try {
    const { eventId, venueId, selectedSeats } = req.body;

    const authUser = await getMongoUserOrFail(req, res);
    if (!authUser) return; // response already sent
    const userId = authUser._id;

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

    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });
    if (!event || !event.seats) {
      return res
        .status(404)
        .json({ message: "Event layout not initialized or found." });
    }

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

    const seatPrice = event.ticketPrice;
    const calculatedTotal = matchingSeats.length * seatPrice;

    const randomHash = Math.random()
      .toString(36)
      .substring(2, 11)
      .toUpperCase();
    const bookingReference = `NOVUS-${randomHash}`;

    const newBooking = {
      customer_id: new ObjectId(userId),
      event_id: new ObjectId(eventId),
      venue_id: new ObjectId(venueId),
      seats: selectedSeats,
      totalPrice: calculatedTotal,
      bookingReference: bookingReference,
      bookingStatus: "confirmed",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);

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
app.get("/bookings", verifyFirebase, async (req, res) => {
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

// ---------------------------------------------------------------------
// PAYSTACK
// ---------------------------------------------------------------------
app.post("/api/paystack/initialize", verifyFirebase, async (req, res) => {
  try {
    const { eventId, venueId, selectedSeats, callbackUrl } = req.body;

    const authUser = await db.collection("users").findOne({ uid: req.uid });
    if (!authUser) {
      return res.status(404).json({ message: "User not found." });
    }
    const userId = authUser._id;

    if (!eventId || !venueId || !selectedSeats || !Array.isArray(selectedSeats) || selectedSeats.length === 0) {
      return res.status(400).json({ message: "Missing or malformed payload fields." });
    }

    if (!userId || !ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID." });
    }

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid event ID." });
    }

    if (!ObjectId.isValid(venueId)) {
      return res.status(400).json({ message: "Invalid venue ID." });
    }

    const eventsCollection = db.collection("events");

    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId)
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (!event.seats) {
      return res.status(404).json({ message: "Event seats not initialized." });
    }

    const matchingSeats = event.seats.filter((seat) =>
      selectedSeats.includes(seat.id)
    );

    if (matchingSeats.length !== selectedSeats.length) {
      return res.status(400).json({
        message: "Some selected seats do not exist."
      });
    }

    const verificationFailed = matchingSeats.some(
      (seat) =>
        seat.status !== "locked" ||
        String(seat.lockedBy) !== String(userId)
    );

    if (verificationFailed) {
      return res.status(400).json({
        message: "One or more seats are no longer locked by your session."
      });
    }

    const seatPrice = Number(event.ticketPrice);

    if (!seatPrice || seatPrice <= 0) {
      return res.status(400).json({
        message: "Invalid ticket price."
      });
    }

    const calculatedTotal = matchingSeats.length * seatPrice;

    const reference = `NOVUS-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: authUser.email,
          amount: Math.round(calculatedTotal * 100),
          currency: "ZAR",
          reference: reference,
          callback_url: callbackUrl,
          metadata: {
            userId: String(userId),
            eventId: String(eventId),
            venueId: String(venueId),
            selectedSeats: selectedSeats
          }
        })
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return res.status(400).json({
        message: "Paystack payment initialization failed.",
        error: paystackData
      });
    }

    return res.status(200).json({
      message: "Payment initialized successfully.",
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: reference,
      eventId: eventId,
      venueId: venueId,
      selectedSeats: selectedSeats,
      totalPrice: calculatedTotal
    });
  } catch (error) {
    console.error("Paystack initialization error:", error);
    return res.status(500).json({
      message: error.message
    });
  }
});

app.get("/api/paystack/verify/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        message: "Unable to verify Paystack payment.",
        error: data
      });
    }

    if (data.data.status !== "success") {
      return res.status(400).json({
        message: "Payment was not successful.",
        status: data.data.status
      });
    }

    const metadata = data.data.metadata;

    const userId = metadata.userId;
    const eventId = metadata.eventId;
    const venueId = metadata.venueId;
    const selectedSeats = metadata.selectedSeats;

    if (
      !ObjectId.isValid(userId) ||
      !ObjectId.isValid(eventId) ||
      !ObjectId.isValid(venueId)
    ) {
      return res.status(400).json({
        message: "Invalid identification IDs from payment."
      });
    }

    const eventsCollection = db.collection("events");
    const bookingsCollection = db.collection("bookings");

    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId)
    });

    if (!event) {
      return res.status(404).json({
        message: "Event not found."
      });
    }

    const matchingSeats = event.seats.filter((seat) =>
      selectedSeats.includes(seat.id)
    );

    if (matchingSeats.length !== selectedSeats.length) {
      return res.status(400).json({
        message: "Some selected seats no longer exist."
      });
    }

    const seatVerificationFailed = matchingSeats.some(
      (seat) =>
        seat.status !== "locked" ||
        String(seat.lockedBy) !== String(userId)
    );

    if (seatVerificationFailed) {
      return res.status(400).json({
        message: "Seats are no longer locked by this user."
      });
    }

    const calculatedTotal = matchingSeats.length * Number(event.ticketPrice);

    const paidAmount = Number(data.data.amount);

    if (paidAmount !== Math.round(calculatedTotal * 100)) {
      return res.status(400).json({
        message: "Payment amount does not match booking total."
      });
    }

    const existingBooking = await bookingsCollection.findOne({
      paymentReference: reference
    });

    if (existingBooking) {
      return res.status(200).json({
        message: "Booking already confirmed.",
        bookingId: existingBooking._id,
        bookingReference: existingBooking.bookingReference,
        bookingStatus: existingBooking.bookingStatus
      });
    }

    const randomHash = Math.random()
      .toString(36)
      .substring(2, 11)
      .toUpperCase();

    const bookingReference = `NOVUS-${randomHash}`;

    const newBooking = {
      customer_id: new ObjectId(userId),
      event_id: new ObjectId(eventId),
      venue_id: new ObjectId(venueId),
      seats: selectedSeats,
      totalPrice: calculatedTotal,
      bookingReference: bookingReference,
      paymentReference: reference,
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      createdAt: new Date()
    };

    const result = await bookingsCollection.insertOne(newBooking);

    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $set: {
          "seats.$[elem].status": "booked",
          "seats.$[elem].lockedBy": null,
          "seats.$[elem].bookingId": result.insertedId
        }
      },
      {
        arrayFilters: [
          {
            "elem.id": { $in: selectedSeats }
          }
        ]
      }
    );

    return res.status(200).json({
      message: "Payment successful and booking confirmed.",
      bookingId: result.insertedId,
      bookingReference: bookingReference,
      bookingStatus: "confirmed",
      totalPrice: calculatedTotal,
      eventId: eventId,
      venueId: venueId,
      seats: selectedSeats
    });
  } catch (error) {
    console.error("Paystack verification error:", error);

    return res.status(500).json({
      message: error.message
    });
  }
});

app.listen(PORT, async () => {
  await connectToDatabase();
  console.log(`Server is running on port ${PORT}`);
});