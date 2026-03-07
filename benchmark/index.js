// benchmark-server/server.js

import dgram from "dgram";

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORTS = {
  UNRELIABLE: 9001,
  RELIABLE: 9002,
  REQUEST_RESPONSE: 9003,
};

const PACKET_TYPE_TRANSPORT = 0x02;

// ============================================================================
// STATISTICS
// ============================================================================

const stats = {
  unreliable: { received: 0, bytes: 0 },
  reliable: { received: 0, acks_sent: 0, bytes: 0 },
  request_response: { received: 0, responses_sent: 0, bytes: 0 },
};

let startTime = Date.now();

// ============================================================================
// SERVER 1: UNRELIABLE (Fire-and-forget)
// ============================================================================

const unreliableServer = dgram.createSocket("udp4");

unreliableServer.on("message", (buffer, rinfo) => {
  stats.unreliable.received++;
  stats.unreliable.bytes += buffer.length;
  
  const message = buffer.toString("utf8");
  console.log(`📥 [UNRELIABLE:${PORTS.UNRELIABLE}] Received from ${rinfo.address}:${rinfo.port}`);
  console.log(`   Data: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
  console.log(`   Size: ${buffer.length} bytes`);
  
  // No responde (fire-and-forget)
});

unreliableServer.on("listening", () => {
  const addr = unreliableServer.address();
  console.log(`✅ [UNRELIABLE] Server listening on ${addr.address}:${addr.port}`);
  console.log(`   Mode: Fire-and-forget (no ACKs)\n`);
});

unreliableServer.bind(PORTS.UNRELIABLE);

// ============================================================================
// SERVER 2: RELIABLE (With ACKs)
// ============================================================================

const reliableServer = dgram.createSocket("udp4");

reliableServer.on("message", (buffer, rinfo) => {
  try {
    // Parsear paquete Transport
    const packetType = buffer[0];
    
    if (packetType !== PACKET_TYPE_TRANSPORT) {
      console.log(`⚠️  [RELIABLE] Not a Transport packet: 0x${packetType.toString(16)}`);
      return;
    }
    
    let offset = 1;
    
    // sequence (u64)
    const sequence = buffer.readBigUInt64LE(offset);
    offset += 8;
    
    // flags
    const reliable = buffer.readUInt8(offset);
    offset += 1;
    const is_ack = buffer.readUInt8(offset);
    offset += 1;
    const ordered = buffer.readUInt8(offset);
    offset += 1;
    
    // payload length (u64)
    const payloadLen = Number(buffer.readBigUInt64LE(offset));
    offset += 8;
    
    // payload
    const payload = buffer.slice(offset, offset + payloadLen);
    
    if (is_ack) {
      console.log(`✅ [RELIABLE:${PORTS.RELIABLE}] Received ACK for sequence ${sequence}`);
      return;
    }
    
    stats.reliable.received++;
    stats.reliable.bytes += buffer.length;
    
    console.log(`📥 [RELIABLE:${PORTS.RELIABLE}] Received packet from ${rinfo.address}:${rinfo.port}`);
    console.log(`   Sequence: ${sequence}`);
    console.log(`   Flags: reliable=${reliable}, ordered=${ordered}`);
    console.log(`   Payload: ${payload.toString("utf8").substring(0, 50)}`);
    console.log(`   Size: ${buffer.length} bytes`);
    
    if (reliable) {
      // Enviar ACK
      const ack = createAckPacket(sequence);
      reliableServer.send(ack, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error(`❌ Failed to send ACK:`, err);
        } else {
          stats.reliable.acks_sent++;
          console.log(`📤 [RELIABLE] ACK sent for sequence ${sequence}\n`);
        }
      });
    }
    
  } catch (err) {
    console.error(`❌ [RELIABLE] Error parsing packet:`, err);
  }
});

reliableServer.on("listening", () => {
  const addr = reliableServer.address();
  console.log(`✅ [RELIABLE] Server listening on ${addr.address}:${addr.port}`);
  console.log(`   Mode: With ACKs and retransmission support\n`);
});

reliableServer.bind(PORTS.RELIABLE);

// ============================================================================
// SERVER 3: REQUEST-RESPONSE (Echo server)
// ============================================================================

const requestResponseServer = dgram.createSocket("udp4");

requestResponseServer.on("message", (buffer, rinfo) => {
  try {
    const packetType = buffer[0];
    
    if (packetType !== PACKET_TYPE_TRANSPORT) {
      console.log(`⚠️  [REQ-RES] Not a Transport packet`);
      return;
    }
    
    let offset = 1;
    
    const sequence = buffer.readBigUInt64LE(offset);
    offset += 8;
    
    const reliable = buffer.readUInt8(offset);
    offset += 1;
    const is_ack = buffer.readUInt8(offset);
    offset += 1;
    const ordered = buffer.readUInt8(offset);
    offset += 1;
    
    const payloadLen = Number(buffer.readBigUInt64LE(offset));
    offset += 8;
    
    const payload = buffer.slice(offset, offset + payloadLen);
    
    stats.request_response.received++;
    stats.request_response.bytes += buffer.length;
    
    console.log(`📥 [REQ-RES:${PORTS.REQUEST_RESPONSE}] Request from ${rinfo.address}:${rinfo.port}`);
    console.log(`   Sequence: ${sequence}`);
    console.log(`   Request: ${payload.toString("utf8")}`);
    
    // Primero enviar ACK si es confiable
    if (reliable) {
      const ack = createAckPacket(sequence);
      requestResponseServer.send(ack, rinfo.port, rinfo.address);
      console.log(`📤 [REQ-RES] ACK sent`);
    }
    
    // Luego enviar respuesta (echo)
    const responsePayload = Buffer.from(`ECHO: ${payload.toString("utf8")}`);
    const response = createResponsePacket(sequence, responsePayload);
    
    requestResponseServer.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error(`❌ Failed to send response:`, err);
      } else {
        stats.request_response.responses_sent++;
        console.log(`📤 [REQ-RES] Response sent\n`);
      }
    });
    
  } catch (err) {
    console.error(`❌ [REQ-RES] Error:`, err);
  }
});

requestResponseServer.on("listening", () => {
  const addr = requestResponseServer.address();
  console.log(`✅ [REQ-RES] Server listening on ${addr.address}:${addr.port}`);
  console.log(`   Mode: Request-Response (Echo)\n`);
});

requestResponseServer.bind(PORTS.REQUEST_RESPONSE);

// ============================================================================
// PACKET BUILDERS
// ============================================================================

function createAckPacket(sequence) {
  // packet_type (u8) + sequence (u64) + flags (3 bytes) + payload_len (u64) + payload (0)
  const buffer = Buffer.allocUnsafe(1 + 8 + 3 + 8);
  
  let offset = 0;
  
  // packet_type
  buffer.writeUInt8(PACKET_TYPE_TRANSPORT, offset);
  offset += 1;
  
  // sequence
  buffer.writeBigUInt64LE(BigInt(sequence), offset);
  offset += 8;
  
  // flags: reliable=false, is_ack=true, ordered=false
  buffer.writeUInt8(0, offset); // reliable
  offset += 1;
  buffer.writeUInt8(1, offset); // is_ack
  offset += 1;
  buffer.writeUInt8(0, offset); // ordered
  offset += 1;
  
  // payload_len (0)
  buffer.writeBigUInt64LE(0n, offset);
  
  return buffer;
}

function createResponsePacket(sequence, payload) {
  const size = 1 + 8 + 3 + 8 + payload.length;
  const buffer = Buffer.allocUnsafe(size);
  
  let offset = 0;
  
  // packet_type
  buffer.writeUInt8(PACKET_TYPE_TRANSPORT, offset);
  offset += 1;
  
  // sequence
  buffer.writeBigUInt64LE(BigInt(sequence), offset);
  offset += 8;
  
  // flags: reliable=true, is_ack=false, ordered=true
  buffer.writeUInt8(1, offset); // reliable
  offset += 1;
  buffer.writeUInt8(0, offset); // is_ack
  offset += 1;
  buffer.writeUInt8(1, offset); // ordered
  offset += 1;
  
  // payload_len
  buffer.writeBigUInt64LE(BigInt(payload.length), offset);
  offset += 8;
  
  // payload
  payload.copy(buffer, offset);
  
  return buffer;
}

// ============================================================================
// STATISTICS DISPLAY
// ============================================================================

setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 BENCHMARK STATISTICS");
  console.log("=".repeat(60));
  console.log(`Uptime: ${uptime}s\n`);
  
  console.log(`UNRELIABLE (Port ${PORTS.UNRELIABLE}):`);
  console.log(`  Packets received: ${stats.unreliable.received}`);
  console.log(`  Total bytes: ${stats.unreliable.bytes}`);
  console.log(`  Rate: ${(stats.unreliable.received / (uptime || 1)).toFixed(2)} pkt/s\n`);
  
  console.log(`RELIABLE (Port ${PORTS.RELIABLE}):`);
  console.log(`  Packets received: ${stats.reliable.received}`);
  console.log(`  ACKs sent: ${stats.reliable.acks_sent}`);
  console.log(`  Total bytes: ${stats.reliable.bytes}`);
  console.log(`  Rate: ${(stats.reliable.received / (uptime || 1)).toFixed(2)} pkt/s\n`);
  
  console.log(`REQUEST-RESPONSE (Port ${PORTS.REQUEST_RESPONSE}):`);
  console.log(`  Requests received: ${stats.request_response.received}`);
  console.log(`  Responses sent: ${stats.request_response.responses_sent}`);
  console.log(`  Total bytes: ${stats.request_response.bytes}`);
  console.log(`  Rate: ${(stats.request_response.received / (uptime || 1)).toFixed(2)} req/s`);
  
  console.log("=".repeat(60) + "\n");
}, 30000); // Cada 30 segundos

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function shutdown() {
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 FINAL STATISTICS");
  console.log("=".repeat(60));
  
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  console.log(`\nTotal uptime: ${uptime}s\n`);
  
  console.log(`UNRELIABLE:`);
  console.log(`  Total packets: ${stats.unreliable.received}`);
  console.log(`  Total bytes: ${stats.unreliable.bytes}`);
  
  console.log(`\nRELIABLE:`);
  console.log(`  Total packets: ${stats.reliable.received}`);
  console.log(`  Total ACKs: ${stats.reliable.acks_sent}`);
  console.log(`  Total bytes: ${stats.reliable.bytes}`);
  
  console.log(`\nREQUEST-RESPONSE:`);
  console.log(`  Total requests: ${stats.request_response.received}`);
  console.log(`  Total responses: ${stats.request_response.responses_sent}`);
  console.log(`  Total bytes: ${stats.request_response.bytes}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("\n👋 Shutting down...\n");
  
  unreliableServer.close();
  reliableServer.close();
  requestResponseServer.close();
  
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ============================================================================
// STARTUP MESSAGE
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log("🚀 BENCHMARK SERVER STARTED");
console.log("=".repeat(60));
console.log("\nListening on:");
console.log(`  📡 Unreliable (fire-and-forget): 0.0.0.0:${PORTS.UNRELIABLE}`);
console.log(`  ✅ Reliable (with ACKs):         0.0.0.0:${PORTS.RELIABLE}`);
console.log(`  🔄 Request-Response (echo):      0.0.0.0:${PORTS.REQUEST_RESPONSE}`);
console.log("\n" + "=".repeat(60) + "\n");