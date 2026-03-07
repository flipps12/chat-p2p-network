// stun-server/server.js

import dgram from "dgram";

// ============================================================================
// CONFIGURATION
// ============================================================================

const UDP_PORT = 3478; // Puerto estándar de STUN
const PACKET_TYPE_STUN = 0x05;

// ============================================================================
// UDP SERVER
// ============================================================================

const server = dgram.createSocket("udp4");

server.on("error", (err) => {
  console.error(`❌ Server error:\n${err.stack}`);
  server.close();
});

server.on("message", (buffer, rinfo) => {
  try {
    handleStunRequest(buffer, rinfo);
  } catch (err) {
    console.error(`❌ Error handling STUN request:`, err);
  }
});

server.on("listening", () => {
  const address = server.address();
  console.log(`✅ STUN Server listening on ${address.address}:${address.port}`);
  console.log(`🌍 Ready to help discover public addresses`);
});

// ============================================================================
// STUN HANDLER
// ============================================================================

function handleStunRequest(buffer, rinfo) {
  console.log(`\n📥 STUN request from ${rinfo.address}:${rinfo.port}`);
  
  // Verificar packet_type
  const packetType = buffer[0];
  
  if (packetType !== PACKET_TYPE_STUN) {
    console.log(`⚠️  Not a STUN packet (type: 0x${packetType.toString(16)})`);
    return;
  }
  
  // Parsear STUN Binding Request
  // Estructura: { packet_type: u8, transaction_id: u64 }
  
  let offset = 0;
  
  // packet_type (u8)
  const packet_type = buffer.readUInt8(offset);
  offset += 1;
  
  // transaction_id (u64, little-endian)
  const transaction_id = buffer.readBigUInt64LE(offset);
  
  console.log(`📦 STUN Binding Request:`);
  console.log(`   Transaction ID: ${transaction_id}`);
  console.log(`   Client's public address: ${rinfo.address}:${rinfo.port}`);
  
  // Crear respuesta STUN
  const response = createStunBindingResponse(
    transaction_id,
    rinfo.address,
    rinfo.port
  );
  
  // Enviar respuesta
  server.send(response, rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.error(`❌ Failed to send STUN response:`, err);
    } else {
      console.log(`✅ STUN response sent`);
    }
  });
}

// ============================================================================
// RESPONSE BUILDER
// ============================================================================

function createStunBindingResponse(transaction_id, mapped_address, mapped_port) {
  const addressBytes = Buffer.from(mapped_address, 'utf8');
  
  // Calcular tamaño total
  // packet_type (1) + transaction_id (8) + address_len (8) + address + port (2)
  const size = 1 + 8 + 8 + addressBytes.length + 2;
  const buffer = Buffer.allocUnsafe(size);
  
  let offset = 0;
  
  // packet_type (u8)
  buffer.writeUInt8(PACKET_TYPE_STUN, offset);
  offset += 1;
  
  // transaction_id (u64, little-endian)
  buffer.writeBigUInt64LE(BigInt(transaction_id), offset);
  offset += 8;
  
  // mapped_address (String: length + bytes)
  buffer.writeBigUInt64LE(BigInt(addressBytes.length), offset);
  offset += 8;
  addressBytes.copy(buffer, offset);
  offset += addressBytes.length;
  
  // mapped_port (u16, little-endian)
  buffer.writeUInt16LE(mapped_port, offset);
  
  console.log(`📤 STUN Response created:`);
  console.log(`   Mapped address: ${mapped_address}`);
  console.log(`   Mapped port: ${mapped_port}`);
  console.log(`   Response size: ${size} bytes`);
  
  return buffer;
}

// ============================================================================
// STATISTICS
// ============================================================================

let requestCount = 0;
let startTime = Date.now();

server.on("message", () => {
  requestCount++;
});

// Mostrar estadísticas cada 5 minutos
setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  
  console.log(`\n📊 STUN Server Statistics:`);
  console.log(`   Uptime: ${hours}h ${minutes}m ${seconds}s`);
  console.log(`   Total requests: ${requestCount}`);
  console.log(`   Requests/min: ${(requestCount / (uptime / 60)).toFixed(2)}`);
}, 300000);

// ============================================================================
// START SERVER
// ============================================================================

server.bind(UDP_PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  console.log(`📊 Final stats: ${requestCount} requests served`);
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});