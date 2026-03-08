# Testing Infrastructure for chat-p2p

This directory contains optional services used to test and improve connectivity for the `chat-p2p` network, particularly in environments affected by NAT or restrictive firewalls.

These services are not required for the core functionality of the P2P network, but they help simulate real-world networking conditions and improve peer discovery and connection reliability.

## Components

### STUN Server

A custom STUN server used for NAT discovery.

Purpose:
- Allow peers to determine their public IP address and port.
- Help identify NAT behavior.
- Assist the P2P transport layer in selecting the best connection strategy.

Initial implementation:
- Built with simple JavaScript for rapid prototyping.

Future plans:
- Reimplement in Rust for better performance, reliability, and integration with the rest of the ecosystem.

### TURN Server

A relay server used when direct peer-to-peer connections cannot be established.

Purpose:
- Relay traffic between peers when NAT traversal fails.
- Ensure connectivity in restrictive networks (e.g. symmetric NATs or strict firewalls).

Initial implementation:
- Lightweight prototype written in JavaScript.

Future plans:
- Rewrite in Rust to support higher throughput, better concurrency handling, and improved security.

## Why Custom Servers?

Although many production-ready STUN/TURN implementations exist, these custom services are used for:

- Learning and experimentation with NAT traversal.
- Fine control over networking behavior during development.
- Integration with the internal architecture of `chat-p2p`.

## Usage

These services are intended only for development and testing environments. They help reproduce network scenarios that may affect peer connectivity.

The core `chat-p2p` network can operate without them, but enabling these services allows more realistic testing of NAT traversal and fallback relay mechanisms.