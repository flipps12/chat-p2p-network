// discovery-server/server.js

import dgram from "dgram";

// ============================================================================
// CONFIGURATION
// ============================================================================

const UDP_PORT = 5005;
const PACKET_TYPE_DISCOVERY = 0x01;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// Almacenamiento de nametags temporales
// nametag -> { peerid, address, port, timestamp }
const nametags = new Map();

// Tiempo de expiración: 10 minutos
const EXPIRATION_TIME = 10 * 60 * 1000;

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
    handleMessage(buffer, rinfo);
  } catch (err) {
    console.error(`❌ Error handling message:`, err);
    
    // Enviar error al cliente
    const errorResponse = createErrorResponse(
      0, // Sin transaction_id conocido
      err.message || "Unknown error"
    );
    server.send(errorResponse, rinfo.port, rinfo.address);
  }
});

server.on("listening", () => {
  const address = server.address();
  console.log(`✅ Discovery Server listening on ${address.address}:${address.port}`);
  console.log(`📡 Ready to handle Discovery requests`);
});

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

function handleMessage(buffer, rinfo) {
  console.log(`\n📥 Received ${buffer.length} bytes from ${rinfo.address}:${rinfo.port}`);
  
  // Verificar packet_type (primer byte)
  const packetType = buffer[0];
  
  if (packetType !== PACKET_TYPE_DISCOVERY) {
    console.log(`⚠️  Not a Discovery packet (type: 0x${packetType.toString(16)})`);
    return;
  }
  
  // Parsear paquete Discovery con bincode
  // Estructura: { packet_type: u8, transaction_id: u64, action: enum }
  
  let offset = 0;
  
  // packet_type (u8)
  const packet_type = buffer.readUInt8(offset);
  offset += 1;
  
  // transaction_id (u64, little-endian)
  const transaction_id = buffer.readBigUInt64LE(offset);
  offset += 8;
  
  // action (enum tag u32 + data)
  const actionTag = buffer.readUInt32LE(offset);
  offset += 4;
  
  console.log(`📦 Packet details:`);
  console.log(`   Type: 0x${packet_type.toString(16)}`);
  console.log(`   Transaction ID: ${transaction_id}`);
  console.log(`   Action tag: ${actionTag}`);
  
  // Procesar según action tag
  switch (actionTag) {
    case 0: // Publish
      handlePublish(buffer, offset, transaction_id, rinfo);
      break;
    case 1: // GetPeerId
      handleGetPeerId(buffer, offset, transaction_id, rinfo);
      break;
    case 2: // GetMyAddress
      handleGetMyAddress(transaction_id, rinfo);
      break;
    default:
      console.log(`❌ Unknown action tag: ${actionTag}`);
      sendError(transaction_id, "Unknown action", rinfo);
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

function handlePublish(buffer, offset, transaction_id, rinfo) {
  console.log(`📝 Handling PUBLISH request`);
  
  try {
    // Parsear nametag (String: u64 length + bytes)
    const nametagLen = Number(buffer.readBigUInt64LE(offset));
    offset += 8;
    const nametag = buffer.toString('utf8', offset, offset + nametagLen);
    offset += nametagLen;
    
    // Parsear peerid (String: u64 length + bytes)
    const peeridLen = Number(buffer.readBigUInt64LE(offset));
    offset += 8;
    const peerid = buffer.toString('utf8', offset, offset + peeridLen);
    
    console.log(`   Nametag: "${nametag}"`);
    console.log(`   PeerID: "${peerid}"`);
    console.log(`   Address: ${rinfo.address}:${rinfo.port}`);
    
    // Guardar en mapa
    nametags.set(nametag, {
      peerid,
      address: rinfo.address,
      port: rinfo.port,
      timestamp: Date.now(),
    });
    
    console.log(`✅ Published: ${nametag} -> ${peerid}`);
    console.log(`📊 Total nametags: ${nametags.size}`);
    
    // Responder con PublishOk
    const response = createPublishOkResponse(transaction_id, "approved");
    server.send(response, rinfo.port, rinfo.address);
    
  } catch (err) {
    console.error(`❌ Error parsing PUBLISH:`, err);
    sendError(transaction_id, "Invalid PUBLISH format", rinfo);
  }
}

function handleGetPeerId(buffer, offset, transaction_id, rinfo) {
  console.log(`🔍 Handling GET_PEER_ID request`);
  
  try {
    // Parsear nametag
    const nametagLen = Number(buffer.readBigUInt64LE(offset));
    offset += 8;
    const nametag = buffer.toString('utf8', offset, offset + nametagLen);
    
    console.log(`   Searching for: "${nametag}"`);
    
    // Buscar en mapa
    const peerData = nametags.get(nametag);
    
    if (peerData) {
      // Verificar si ha expirado
      const age = Date.now() - peerData.timestamp;
      if (age > EXPIRATION_TIME) {
        console.log(`⏰ Nametag expired (${Math.floor(age / 1000)}s old)`);
        nametags.delete(nametag);
        sendError(transaction_id, "Nametag expired", rinfo);
        return;
      }
      
      console.log(`✅ Found: ${peerData.peerid} at ${peerData.address}:${peerData.port}`);
      
      // Responder con PeerInfo
      const response = createPeerInfoResponse(
        transaction_id,
        peerData.address,
        peerData.port,
        peerData.peerid
      );
      server.send(response, rinfo.port, rinfo.address);
      
    } else {
      console.log(`❌ Nametag not found`);
      sendError(transaction_id, "Nametag not found", rinfo);
    }
    
  } catch (err) {
    console.error(`❌ Error parsing GET_PEER_ID:`, err);
    sendError(transaction_id, "Invalid GET_PEER_ID format", rinfo);
  }
}

function handleGetMyAddress(transaction_id, rinfo) {
  console.log(`🌍 Handling GET_MY_ADDRESS request`);
  console.log(`   Client's public address: ${rinfo.address}:${rinfo.port}`);
  
  // Responder con MyAddress
  const response = createMyAddressResponse(
    transaction_id,
    rinfo.address,
    rinfo.port
  );
  server.send(response, rinfo.port, rinfo.address);
}

// ============================================================================
// RESPONSE BUILDERS (bincode format)
// ============================================================================

function createPublishOkResponse(transaction_id, status) {
  const statusBytes = Buffer.from(status, 'utf8');
  
  // Calcular tamaño total
  const size = 1 + 8 + 4 + 8 + statusBytes.length;
  const buffer = Buffer.allocUnsafe(size);
  
  let offset = 0;
  
  // packet_type (u8)
  buffer.writeUInt8(PACKET_TYPE_DISCOVERY, offset);
  offset += 1;
  
  // transaction_id (u64)
  buffer.writeBigUInt64LE(BigInt(transaction_id), offset);
  offset += 8;
  
  // result tag (u32) - 0 = PublishOk
  buffer.writeUInt32LE(0, offset);
  offset += 4;
  
  // status (String)
  buffer.writeBigUInt64LE(BigInt(statusBytes.length), offset);
  offset += 8;
  statusBytes.copy(buffer, offset);
  
  return buffer;
}

function createPeerInfoResponse(transaction_id, address, port, peerid) {
  const addressBytes = Buffer.from(address, 'utf8');
  const peeridBytes = Buffer.from(peerid, 'utf8');
  
  const size = 1 + 8 + 4 + 8 + addressBytes.length + 2 + 8 + peeridBytes.length;
  const buffer = Buffer.allocUnsafe(size);
  
  let offset = 0;
  
  // packet_type
  buffer.writeUInt8(PACKET_TYPE_DISCOVERY, offset);
  offset += 1;
  
  // transaction_id
  buffer.writeBigUInt64LE(BigInt(transaction_id), offset);
  offset += 8;
  
  // result tag - 1 = PeerInfo
  buffer.writeUInt32LE(1, offset);
  offset += 4;
  
  // address (String)
  buffer.writeBigUInt64LE(BigInt(addressBytes.length), offset);
  offset += 8;
  addressBytes.copy(buffer, offset);
  offset += addressBytes.length;
  
  // port (u16)
  buffer.writeUInt16LE(port, offset);
  offset += 2;
  
  // peerid (String)
  buffer.writeBigUInt64LE(BigInt(peeridBytes.length), offset);
  offset += 8;
  peeridBytes.copy(buffer, offset);
  
  return buffer;
}

function createMyAddressResponse(transaction_id, address, port) {
  const addressBytes = Buffer.from(address, 'utf8');
  
  const size = 1 + 8 + 4 + 8 + addressBytes.length + 2;
  const buffer = Buffer.allocUnsafe(size);
  
  let offset = 0;
  
  // packet_type
  buffer.writeUInt8(PACKET_TYPE_DISCOVERY, offset);
  offset += 1;
  
  // transaction_id
  buffer.writeBigUInt64LE(BigInt(transaction_id), offset);
  offset += 8;
  
  // result tag - 2 = MyAddress
  buffer.writeUInt32LE(2, offset);
  offset += 4;
  
  // address (String)
  buffer.writeBigUInt64LE(BigInt(addressBytes.length), offset);
  offset += 8;
  addressBytes.copy(buffer, offset);
  offset += addressBytes.length;
  
  // port (u16)
  buffer.writeUInt16LE(port, offset);
  
  return buffer;
}

function createErrorResponse(transaction_id, message) {
  const messageBytes = Buffer.from(message, 'utf8');
  
  const size = 1 + 8 + 4 + 8 + messageBytes.length;
  const buffer = Buffer.allocUnsafe(size);
  
  let offset = 0;
  
  // packet_type
  buffer.writeUInt8(PACKET_TYPE_DISCOVERY, offset);
  offset += 1;
  
  // transaction_id
  buffer.writeBigUInt64LE(BigInt(transaction_id), offset);
  offset += 8;
  
  // result tag - 3 = Error
  buffer.writeUInt32LE(3, offset);
  offset += 4;
  
  // message (String)
  buffer.writeBigUInt64LE(BigInt(messageBytes.length), offset);
  offset += 8;
  messageBytes.copy(buffer, offset);
  
  return buffer;
}

function sendError(transaction_id, message, rinfo) {
  const response = createErrorResponse(transaction_id, message);
  server.send(response, rinfo.port, rinfo.address);
}

// ============================================================================
// CLEANUP - Eliminar nametags expirados
// ============================================================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [nametag, data] of nametags.entries()) {
    const age = now - data.timestamp;
    if (age > EXPIRATION_TIME) {
      nametags.delete(nametag);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired nametags`);
    console.log(`📊 Active nametags: ${nametags.size}`);
  }
}, 60000); // Cada minuto

// ============================================================================
// START SERVER
// ============================================================================

server.bind(UDP_PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});