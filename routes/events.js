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

router.delete("/:id", verifyFirebase, async (req, res) => {
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