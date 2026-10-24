// In-memory admission guards for the shared PocketNet Durable Object.
// Never persist client IP addresses or attach them to telemetry.
//
// A full table fails closed for previously unseen keys rather than evicting
// active counters (which would let an IP-cycle bypass request limits).
export class AdmissionLimiter {
  constructor({limit,windowMs=60_000,maxKeys=2048}={}) {
    if(!Number.isInteger(limit)||limit<1||!Number.isInteger(windowMs)||windowMs<1||
       !Number.isInteger(maxKeys)||maxKeys<1) throw new TypeError('Invalid admission limits');
    this.limit=limit;
    this.windowMs=windowMs;
    this.maxKeys=maxKeys;
    this.buckets=new Map();
    this.rejections=0;
  }

  sweep(now=Date.now()) {
    for(const [key,record] of this.buckets)
      if(now-record.started>=this.windowMs || now<record.started) this.buckets.delete(key);
    return this.buckets.size;
  }

  check(key,now=Date.now()) {
    // Only the Cloudflare-assigned peer IP is used; missing or oversized input
    // deliberately shares a conservative anonymous bucket.
    const id=typeof key==='string'&&key.length>0&&key.length<=64 ? key : 'unknown';
    let record=this.buckets.get(id);
    if(record&&(now-record.started>=this.windowMs||now<record.started)) {
      this.buckets.delete(id);
      record=null;
    }
    if(!record) {
      if(this.buckets.size>=this.maxKeys) this.sweep(now);
      if(this.buckets.size>=this.maxKeys) {
        this.rejections++;
        return {allowed:false,retryAfter:Math.max(1,Math.ceil(this.windowMs/1000)),reason:'capacity'};
      }
      record={started:now,count:0};
      this.buckets.set(id,record);
    }
    if(record.count>=this.limit) {
      this.rejections++;
      return {allowed:false,retryAfter:Math.max(1,Math.ceil((record.started+this.windowMs-now)/1000)),reason:'rate'};
    }
    record.count++;
    return {allowed:true};
  }

  snapshot() {
    return {activeBuckets:this.buckets.size,rejections:this.rejections};
  }
}
