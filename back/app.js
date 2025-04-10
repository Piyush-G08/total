const express = require('express');
const app = express();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const User = require('./models/userModel');
const Ticket = require('./models/ticketModel'); // Your Ticket model

app.use(express.json()); // To parse JSON bodies
app.use(cors());

mongoose.connect('mongodb+srv://pags:Jvi45GLvQaIERdZ0@cluster0.gebpz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Initialize fixed user
(async () => {
  try {
    const fixedUserId = 'BYT2025';
    const fixedPassword = 'byt@123';
    const hashedPassword = await bcrypt.hash(fixedPassword, 10);
    const existingUser = await User.findOne({ userId: fixedUserId });
    if (!existingUser) {
      const newUser = new User({ userId: fixedUserId, password: hashedPassword });
      await newUser.save();
      console.log("Fixed user created successfully.");
    }
  } catch (error) {
    console.error("Error initializing user:", error);
  }
})();

// User Login Route
app.post('/api/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    const user = await User.findOne({ userId });
    if (!user) return res.status(400).json({ message: 'User not found' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.userId }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Daily Report Route
app.get('/api/daily-report', async (req, res) => {
  try {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);

    const dailyEntries = await Ticket.find({
      entryTime: { $gte: midnight, $lt: nextMidnight }
    });

    console.log('Daily Entries:', dailyEntries); // Debugging log
    res.json(dailyEntries);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Monthly Report Route
app.get('/api/monthly-report', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    console.log('Start of Month:', startOfMonth);
    console.log('End of Month:', endOfMonth);

    const monthlyEntries = await Ticket.find({
      entryTime: { $gte: startOfMonth, $lte: endOfMonth }
    }).sort({ entryTime: 1 }); // Sort by time

    if (monthlyEntries.length === 0) {
      return res.status(404).json({ message: "No records found for this month." });
    }

    res.json(monthlyEntries);
  } catch (error) {
    console.error('Error fetching monthly report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Protected Delete Route
app.delete('/api/delete-data', async (req, res) => {
  try {
    // Add authentication and authorization checks here
    await Ticket.deleteMany({});
    res.json({ message: 'All data deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Ticket Creation Route
app.post('/api/tickets', async (req, res) => {
  try {
    const { ticketNumber, vehicleType, vehicleNumber, entryTime, exitTime, duration, billAmount, qrCode } = req.body;
    
    // Validate entryTime
    const validEntryTime = new Date(entryTime);
    if (isNaN(validEntryTime)) {
      return res.status(400).json({ message: 'Invalid entry time format.' });
    }

    const newTicket = new Ticket({
      ticketNumber,
      vehicleType,
      vehicleNumber,
      entryTime: validEntryTime, // Use validated entryTime
      exitTime: exitTime ? new Date(exitTime) : null,
      duration,
      billAmount,
      qrCode // Include QR code in the ticket creation
    });

    const savedTicket = await newTicket.save();
    res.status(201).json(savedTicket);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Fetch Ticket by Ticket Number (For Vehicle Out Entry)
app.get('/api/tickets/validate/:ticketNumber', async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber });

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Ticket Retrieval Route
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find();
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🚗 Vehicle Entry Route - New Route to Save Vehicle Entry
// Vehicle Entry Route
app.post('/api/vehicle-entry', async (req, res) => {
  try {
    const { ticketNumber, vehicleType, vehicleNumber, qrCode } = req.body;

    // Capture the current time on the server
    const entryTime = new Date();

    const newTicket = new Ticket({
      ticketNumber,
      vehicleType,
      vehicleNumber,
      entryTime, // Use the server's current time
      qrCode
    });

    await newTicket.save();

    console.log('New Ticket Saved:', newTicket); // Debugging log
    res.status(200).json({ success: true, message: 'Vehicle entry saved successfully!', ticket: newTicket });
  } catch (error) {
    console.error("Error saving vehicle entry:", error);
    res.status(500).json({ success: false, message: 'Error saving vehicle entry.' });
  }
});

// 🚙 Vehicle Out Entry Route - Validate Ticket and Generate Exit Ticket
app.post('/api/vehicle-exit', async (req, res) => {
  try {
    const { ticketNumber } = req.body;

    const ticket = await Ticket.findOne({ ticketNumber });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const currentTime = new Date();
    ticket.exitTime = currentTime;

    // Calculate parking duration and bill
    const entryTime = new Date(ticket.entryTime);
    const durationMs = currentTime - entryTime;
    let durationHours = Math.ceil(durationMs / (1000 * 60 * 60));

    const parkingCharges = {
      Bike: [10, 5, 50, 30, 750], // [Hourly rate, Additional hourly rate, Daily rate, Additional daily rate, Monthly rate]
      Cycle: [5, 2, 35, 20, 525],
      Car: [20, 10, 100, 60, 1500],
      Auto: [15, 8, 90, 60, 1500],
    };

    const billAmount = calculateBill(ticket.vehicleType, durationHours, parkingCharges);

    // Update the ticket with exit time, duration, and bill amount
    ticket.duration = durationHours * 60; // Convert hours to minutes
    ticket.billAmount = billAmount;

    await ticket.save();

    res.json({
      success: true,
      message: "Exit ticket generated successfully",
      ticket: {
        ticketNumber: ticket.ticketNumber,
        vehicleType: ticket.vehicleType,
        vehicleNumber: ticket.vehicleNumber,
        entryTime: entryTime.toISOString(), // Send in ISO format
        exitTime: currentTime.toISOString(), // Send in ISO format
        duration: `${durationHours} hour(s)`,
        billAmount: billAmount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error generating exit ticket" });
  }
});

function calculateBill(vehicleType, durationHours, parkingCharges) {
  const charges = parkingCharges[vehicleType] || [0, 0, 0, 0, 0];
  let billAmount = 0;

  // Calculate based on days first
  const days = Math.floor(durationHours / 24);
  const remainingHours = durationHours % 24;

  // Day-wise charges
  if (days > 0) {
    billAmount += charges[2] + (days - 1) * charges[3];
  }

  // Hour-wise charges for remaining hours
  if (remainingHours > 0) {
    billAmount += charges[0];
    if (remainingHours > 1) {
      billAmount += Math.floor(remainingHours - 1) * charges[1];
    }
    if (remainingHours % 1 !== 0) { // If there are remaining minutes
      billAmount += charges[1];
    }
  }

  return billAmount;
}

// Start the server
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});