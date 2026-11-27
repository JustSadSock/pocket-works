export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')}
export async function verifyAudition(meta,bytes,score){
 if(meta?.schema!=='notograph-recorded-audition-v1'||meta.approval!=='research-only'||meta.file!=='recorded-score.wav'||!Number.isInteger(meta.rendered)||!Number.isInteger(meta.requested)||meta.rendered<1||meta.rendered>meta.requested||!Array.isArray(meta.omitted)||meta.omitted.length!==meta.requested-meta.rendered||!Array.isArray(meta.instruments)||!meta.instruments.length||bytes.byteLength>36*1024*1024)throw Error('Неверный пакет записанного рендера.');
 if(await sha256(new TextEncoder().encode(score))!==meta.scoreSha256)throw Error('Рендер относится к другой партитуре или темпу.');
 if(await sha256(bytes)!==meta.wavSha256)throw Error('WAV не соответствует контрольной сумме.');
 const view=new DataView(bytes);if(view.byteLength<44||view.getUint32(0)!==0x52494646||view.getUint32(8)!==0x57415645)throw Error('Не WAV.');
 return meta;
}
