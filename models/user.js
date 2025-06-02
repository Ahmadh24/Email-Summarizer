const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    summaryEmail: { type: String, required: true },
    gmailToken: Object,
    createdAt: { type: Date, default: Date.now },
    preferences: {
        deliveryTime: {
            type: Object,
            default: {
                hours: 18,   // 6 PM
                minutes: 0
            },
            validate: {
                validator: function(v) {
                    return v.hours >= 0 && v.hours <= 23 && v.minutes >= 0 && v.minutes <= 59;
                },
                message: 'Invalid time format. Hours must be 0-23, minutes must be 0-59'
            }
        },
        categories: [String],
        lookbackDays: { type: Number, default: 1 }
    }
});

module.exports = mongoose.model('User', userSchema); 