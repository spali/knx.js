/**
 * knx.js - a pure Javascript library for KNX
 * (C) 2016 Elias Karakoulakis
 */

const util = require('util');
const dgram = require('dgram');
const ipaddr = require('ipaddr.js');
const udpPuncher = require('udp-hole-puncher');
/*
<summary>
  Initializes a new KNX tunneling connection with provided values.
  Make sure the local system allows
  UDP messages to the localIpAddress and localPort provided
</summary>
*/
function IpTunnelingConnection(instance, options) {

  instance.BindSocket = function(cb) {
    instance.debugPrint('IpTunnelingConnection.BindSocket ' + this.localIntf.address);
    var udpSocket = dgram.createSocket({
      type: "udp4",
      address: this.localIntf.address
    });
    if (this.usingNAT) {
      udpSocket.on('listening', function() {
        // puncher config
        var puncher = new udpPuncher(udpSocket);
        // when connection is established, send dummy message
        puncher.on('connected', function(j) {
          console.log('puncher.connected %j', j);
          //var message = new Buffer('hello')
          //udpSocket.send(message, 0, message.length, peer.port, peer.addr)
        });
        // error handling code
        puncher.on('error', function(error) {
          console.log('puncher.error %j', error);
          //  ...
        });
        // connect to peer (using its public address and port)
        console.log('punching hole from %j to %j', udpSocket.address(),
          instance.remoteEndpoint.addrstring);
        puncher.connect(
          instance.remoteEndpoint.addrstring, instance.remoteEndpoint.port
        )
      });
    }
    udpSocket.bind(function() {
      instance.debugPrint(util.format('tunneling socket bound to %j',
        udpSocket.address()));
      cb && cb(udpSocket);
    });
    return udpSocket;
  }

  instance.Connect = function() {
    var sm = this;
    // get the most suitable interface for connecting to KNX
    this.localIntf = this.getLocalInterface(this.remoteEndpoint.addr);
    // 1) is the target KNX router outside our network/mask?
    if (!instance.containsAddress(this.localIntf, this.remoteEndpoint.addr)) {
      // AND 2) is this host using a private IP adddress ?
      var localAddr = ipaddr.parse(this.localIntf.address);
      if (localAddr.range() == 'private') {
        console.log('using NAT hole puncher');
        this.usingNAT = true;
      }
    }
    this.localAddress = this.localIntf.address;
    // create a control socket for CONNECT, CONNECTIONSTATE and DISCONNECT
    this.control = this.BindSocket(function(socket) {
      socket.on("message", function(msg, rinfo, callback) {
        sm.debugPrint('Inbound message in CONTROL channel');
        sm.onUdpSocketMessage(msg, rinfo, callback);
      });
      // create a tunnel socket for TUNNELING_REQUEST and friends
      sm.tunnel = sm.BindSocket(function(socket) {
        socket.on("message", function(msg, rinfo, callback) {
          sm.debugPrint('Inbound message in TUNNEL channel');
          sm.onUdpSocketMessage(msg, rinfo, callback);
        });
        // start connection sequence
        sm.transition('connecting');
      })
    });
    return this;
  }

  instance.disconnected = function() {
    this.control.close();
    this.tunnel.close();
  }

  return instance;
}


module.exports = IpTunnelingConnection;
