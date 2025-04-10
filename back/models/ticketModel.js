const mongoose = require('mongoose');

// Define the ticket schema
const ticketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  vehicleType: {
    type: String,
    required: true,
    enum: ['Cycle', 'Bike', 'Car', 'Auto'],
    trim: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  entryTime: {
    type: Date,
    required: true
  },
  exitTime: {
    type: Date
  },
  duration: {
    type: Number // Duration in minutes
  },
  billAmount: {
    type: Number
  },
  qrCode: {  // New field for QR code
    type: String,
    trim: true
  }
});

// Middleware to calculate duration and billAmount before saving
ticketSchema.pre('save', function (next) {
  if (this.isModified('exitTime') && this.exitTime && this.entryTime) {
    const durationInMs = this.exitTime - this.entryTime;
    this.duration = Math.floor(durationInMs / (1000 * 60)); // Convert milliseconds to minutes

    const durationHours = Math.ceil(this.duration / 60); // Convert minutes to hours, rounding up

    const parkingCharges = {
      Bike: [10, 5, 50, 30, 750], // [Hourly rate, Additional hourly rate, Daily rate, Additional daily rate, Monthly rate]
      Cycle: [5, 2, 35, 20, 525],
      Car: [20, 10, 100, 60, 1500],
      Auto: [15, 8, 90, 60, 1500],
    };

    this.billAmount = calculateBill(this.vehicleType, durationHours, parkingCharges);
  }
  next();
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

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;