const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000;
const app = express();

// --------------------- Middlewares ---------------------
app.use(cookieParser());
app.use(cors({
  origin: [' https://language-exchange-acb12.web.app','http://localhost:5174'], // frontend URL
  credentials: true
}));
app.use(express.json());

// --------------------- JWT Verify Middleware ---------------------
function verifyToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).send({ message: "No token, unauthorized" });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Invalid or expired token" });
    req.user = decoded;
    next();
  });
}

// --------------------- MongoDB Connection ---------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rdbtijm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const tutorCollections = client.db('LanguageTutor').collection('tutors');
    const bokedCollection = client.db('LanguageTutor').collection('bokedItem');

    // --------------------- Auth Routes ---------------------
    app.post('/login', async (req, res) => {
      const { email } = req.body;
      if (!email) return res.status(400).send({ message: "Email is required" });

      const user = { email };
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true, message: "Login successful" });
    });

    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true, message: 'Logged out successfully' });
    });

    // --------------------- Tutor Routes ---------------------
    app.post('/tutors',  async (req, res) => {
      const tutorInfo = req.body;
      const result = await tutorCollections.insertOne(tutorInfo);
      res.send(result);
    });

    app.get('/tutors', async (req, res) => {
      const cursor = tutorCollections.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/tutors/email', async (req, res) => {
      const { email } = req.query;
      const result = await tutorCollections.findOne({ email });
      res.send(result || null);
    });

    app.get('/tutors/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).send({ error: 'Invalid ID format' });
      const tutor = await tutorCollections.findOne({ _id: new ObjectId(id) });
      res.send(tutor);
    });

    app.put('/tutors/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ error: 'Invalid ID format' });

        const updatedTutor = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            image: updatedTutor.image,
            language: updatedTutor.language,
            price: updatedTutor.price,
            description: updatedTutor.description,
            reviewCount: updatedTutor.reviewCount || 0,
          },
        };

        const result = await tutorCollections.updateOne(query, updateDoc);
        if (result.matchedCount === 0) return res.status(404).send({ message: 'Tutor not found' });

        res.send({ success: true, result });
      } catch (error) {
        console.error("PUT /tutors/:id error:", error);
        res.status(500).send({ error: 'Internal Server Error', message: error.message });
      }
    });

    app.delete('/tutors/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid ID format' });

      const query = { _id: new ObjectId(id) };
      const result = await tutorCollections.deleteOne(query);

      if (result.deletedCount === 0) return res.status(404).send({ message: 'Tutor not found' });
      res.status(200).send({ success: true, deletedCount: result.deletedCount });
    });

    // --------------------- Booked Items ---------------------
    app.post('/bokedItem', verifyToken, async (req, res) => {
      const item = req.body;
      const result = await bokedCollection.insertOne(item);
      res.send(result);
    });

    app.get('/bokedItem', verifyToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ message: "Email query parameter is required." });

        const result = await bokedCollection.find({ email }).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching booked items by email:", error);
        res.status(500).send({ message: "Failed to fetch booked items by email", error: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close(); // Keep connection alive
  }
}
run().catch(console.dir);

// --------------------- Root ---------------------
app.get('/', (req, res) => {
  res.send('Tutors API is running...');
});

app.listen(port, () => {
  console.log(`Tutor server is running on port ${port}`);
});
