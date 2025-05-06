# ESP8266 NodeMCU Setup for Medication Tracker

This guide explains how to set up the ESP8266 NodeMCU with an IR sensor to automatically detect when medications are taken and update your medication tracker website wirelessly.

## Hardware Requirements

- ESP8266 NodeMCU (CH340 WiFi Module)
- IR obstacle avoidance sensor
- Breadboard and jumper wires
- Micro USB cable for power and programming

## Hardware Connection

1. **Connect the IR sensor to the ESP8266 NodeMCU**:
   - VCC pin on IR sensor → 3.3V pin on NodeMCU
   - GND pin on IR sensor → GND pin on NodeMCU
   - OUT pin on IR sensor → D2 pin on NodeMCU (GPIO4)

   ![ESP8266 and IR sensor wiring diagram](https://i.imgur.com/example.jpg)

2. **NodeMCU Pinout Reference**:
   - The NodeMCU has both D# labels and GPIO# numbers
   - In our code, we use the D# labels (e.g., D2)
   - The built-in LED is connected to D4 (GPIO2)

## Software Setup

### 1. Install Required Arduino Libraries

1. Open the Arduino IDE
2. Go to **Tools → Manage Libraries...**
3. Install the following libraries:
   - **ESP8266WiFi** (should be installed with ESP8266 board support)
   - **ArduinoJson** (search for "ArduinoJson" by Benoit Blanchon)
   - **WebSockets** (search for "WebSockets" by Markus Sattler)

### 2. Configure ESP8266 in Arduino IDE

1. Go to **File → Preferences**
2. In "Additional Boards Manager URLs", add:
   ```
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Go to **Tools → Board → Boards Manager...**
4. Search for "esp8266" and install "ESP8266 by ESP8266 Community"
5. Select your board: **Tools → Board → ESP8266 Boards → NodeMCU 1.0 (ESP-12E Module)**
6. Set upload speed: **Tools → Upload Speed → 115200**

### 3. Configure the ESP8266 Sketch

1. Open the `esp8266_ir_sensor.ino` file in Arduino IDE
2. Update the WiFi settings:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";      // Replace with your WiFi name
   const char* password = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password
   ```
3. Update the WebSocket server information:
   ```cpp
   const char* websocket_server = "192.168.1.100"; // Replace with your server IP
   ```
   This should be the IP address of the computer running `arduino_server.js`

### 4. Upload the Sketch

1. Connect your ESP8266 NodeMCU to your computer via USB
2. Select the correct COM port: **Tools → Port → COM# (NodeMCU)**
3. Click the **Upload** button
4. Open the **Serial Monitor** to verify the ESP8266 is connecting to WiFi and the WebSocket server

## Using with the Medication Tracker

1. Position the ESP8266 and IR sensor near your medication storage area
2. The IR sensor should detect motion when you take your medication
3. When medication is detected, the ESP8266 will:
   - Turn on its built-in LED
   - Send a WebSocket message to the server
   - The website will update to show the medication as taken

## Troubleshooting

### ESP8266 Not Connecting to WiFi

1. Double-check your WiFi SSID and password in the sketch
2. Make sure your WiFi network is 2.4GHz (ESP8266 doesn't support 5GHz)
3. Check the Serial Monitor for error messages

### IR Sensor Not Detecting

1. Adjust the sensitivity of the IR sensor using the potentiometer on the sensor module
2. Make sure nothing is blocking the IR emitter or receiver
3. Test by placing your hand in front of the sensor - the LED on the sensor should change state

### WebSocket Connection Issues

1. Verify the server IP address is correct
2. Make sure the NodeMCU and your server are on the same network
3. Check if firewalls are blocking WebSocket connections on port 3000
4. Check the Serial Monitor for connection error messages

## Power Options

For permanent installation, you can power the ESP8266 NodeMCU using:

1. A USB power adapter (recommended)
2. A power bank for temporary use
3. A 5V DC power supply connected to the VIN and GND pins

## Advanced Configuration

You can modify the ESP8266 code to:

- Add multiple IR sensors for different medications
- Add different colored LEDs to indicate different medications
- Add a small display to show medication names and times
- Configure deep sleep mode to save power when not in use 