// HTTP server for p2p managment and discovery
import express from "express";
// socket udp for p2p communication
import dgram from "dgram";
import { match } from "assert";

// UDP config
const server = dgram.createSocket("udp4");
const UDP_PORT = 5005;

// HTTP config
const app = express();
const PORT = 3000;

// UDP server setup
server.on("error", (err) => {
  console.error(`server error:\n${err.stack}`);
  server.close();
});

server.on("message", (buffer, rinfo) => {
  console.log("Auto discover ip:port");

  let msg = buffer.toString("utf8").trim();

  // empty message ---
  if (!msg) {
    server.send( JSON.stringify(`{"address": ${rinfo.address}, "port": ${rinfo.port}}`), rinfo.port, rinfo.address);
    return;
  }

  let msg_json;

  try {
    msg_json = JSON.parse(msg);
  } catch (err) {
    server.send( JSON.stringify(`{"address": ${rinfo.address}, "port": ${rinfo.port}}`), rinfo.port, rinfo.address);
    console.log("Invalid JSON:", msg);
    return;
  }
  // ---

  console.log(msg_json);

  switch (msg_json.header) {
    // parse to json
    case "getpeerid":
      server.send(`peeridtest`, rinfo.port, rinfo.address);
      console.log("nametag: " + msg_json.body.nametag);
      break;
    case "publish":
      // publicar y devolver status 
      server.send("Ok", rinfo.port, rinfo.address);
      console.log("peerid: " + msg_json.body.peerid);
      break;

    default:
      server.send( JSON.stringify(`{"address": ${rinfo.address}, "port": ${rinfo.port}}`), rinfo.port, rinfo.address);
  }

  console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

server.on("listening", () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

// HTTP
// app.get("/discover", (req, res) => {
//   const nametag = req.query.nametag;
//   console.log(`Received discovery request with nametag: ${nametag}`);
//   res.send("Peerid");
// });

// app.post("/public", (req, res) => {
//   req.on("data", (chunk) => {
//     console.log("Received public message:", chunk.toString());
//   });
//   res.send("Ok");
// });

// Start servers
server.bind(UDP_PORT);
app.listen(PORT, () => {
  console.log(`P2P Network server is running on port ${PORT}`);
});

// todo, mudar todo a udp, eliminar http o reservar para futuro
