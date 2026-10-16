// The authoritative phase deadline is a server epoch timestamp.
// Device clocks may differ by seconds; an RTT-corrected echo aligns them.
export class ServerClock{
 constructor(){this.offset=0;this.calibrated=false;this.bestRtt=Infinity;this.lastEcho=0}
 now(){return Date.now()+this.offset}
 reset(){this.offset=0;this.calibrated=false;this.bestRtt=Infinity;this.lastEcho=0}
 observeState(serverNow,arrival=Date.now()){
  if(!Number.isFinite(serverNow)||this.calibrated)return false;
  this.offset=serverNow-arrival;return true;
 }
 observeEcho(sentAt,serverNow,receivedAt=Date.now()){
  const rtt=receivedAt-sentAt;
  if(!Number.isFinite(serverNow)||!Number.isFinite(sentAt)||!Number.isFinite(rtt)||rtt<0||rtt>15000)return false;
  const measured=serverNow-(sentAt+receivedAt)/2;
  // A delayed response is noisier. Prefer a low-latency exchange but
  // allow future samples to compensate clock adjustments or connectivity.
  if(!this.calibrated||rtt<=this.bestRtt*1.8||receivedAt-this.lastEcho>30000){
   this.offset=measured;this.bestRtt=Math.min(this.bestRtt,rtt);this.lastEcho=receivedAt;
   this.calibrated=true;return true;
  }
  return false;
 }
}
