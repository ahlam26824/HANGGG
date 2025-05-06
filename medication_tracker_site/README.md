# Medication Tracker with Arduino IR Sensor Integration

This project is a web-based medication tracking system enhanced with an Arduino IR sensor to automatically detect when medications are taken.

## Features

- Track medications with schedules, dosages, and reminders
- Automatic medication detection using IR sensor
- Real-time updates when medication is detected
- Customizable reminders and notifications
- Statistics tracking for medication adherence

## Hardware Requirements

- Arduino Uno or compatible board
- IR obstacle avoidance sensor
- Breadboard and jumper wires
- Optional: LED for visual feedback

## Software Requirements

- Node.js (v14 or higher)
- Arduino IDE
- Web browser with WebSocket support

## Hardware Setup

1. Connect the IR sensor to the Arduino:
   - VCC pin to 5V on Arduino
   - GND pin to GND on Arduino
   - OUT pin to Digital Pin 2 on Arduino

2. (Optional) Connect an LED:
   - Positive leg (anode) to Digital Pin 13 through a 220Ω resistor
   - Negative leg (cathode) to GND

## Installation

### Arduino Setup

1. Connect your Arduino to your computer via USB
2. Open the Arduino IDE
3. Open the `arduino_ir_sensor.ino` file
4. Select your board and port
5. Upload the sketch to your Arduino

### Node.js Server Setup

1. Install Node.js dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

### Web Application Setup

1. Open `index.html` in your web browser
2. The application should automatically connect to the Arduino server

## Usage

1. Add your medications in the web interface
2. When it's time to take medication, the app will notify you
3. Take your medication, passing it in front of the IR sensor
4. The app will automatically mark the medication as taken
5. Check your adherence statistics and history

## IR Sensor Positioning

For optimal detection:
- Place the IR sensor near your medication storage area
- Position it so medications must pass through its beam when taken
- Ensure consistent lighting conditions for reliable detection

## Troubleshooting

- **IR Sensor Not Detecting**: Adjust the sensitivity potentiometer on the IR sensor
- **Connection Issues**: Check that the Arduino is connected and the Node.js server is running
- **Serial Port Not Found**: Verify the correct port in `arduino_server.js` (update the `portName` variable)

## Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js with Express
- Communication: WebSockets
- Hardware: Arduino with IR sensor

## Customization

- To modify the medication detection logic, edit the `handleMedicationTakenEvent` function in `script.js`
- To change the IR sensor pin, update the `irSensorPin` constant in the Arduino sketch
- To customize notification behavior, modify the related functions in `script.js` 