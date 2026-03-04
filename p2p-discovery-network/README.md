# Discover server

Usando uno o mas sockets UDPs, se conocera la propia direccion ip y puerto usado en internet, usando un sistema con nametags no persistentes, se podra conseguir la dirección, puerto y peerId del peer buscado.

## Udp Socket

En localhost:5005

| Header      | Body (Request)                                | Response (Success)                                            | Description                                                    |
| ----------- | --------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `publish`   | `{ "nametag": "string", "peerid": "string" }` | `{ "status": "approved" \| "declined" \| "..." }`             | Publica un `peerid` asociado a un `nametag`.                   |
| `getpeerid` | `{ "nametag": "string" }`                     | `{ "address": "string", "port": number, "peerid": "string" }` | Obtiene dirección, puerto y `peerid` asociados a un `nametag`. |
| *(empty)*   | *(empty)*                                     | `{ "address": "string", "port": number }`                     | Devuelve la dirección pública detectada del cliente.           |
