router.post("/", async (req, res) => {
    try {
        const event = req.body;
        const collection = db.collection("events");
        const result = await collection.insertOne({...event,createdAt: new Date()});
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