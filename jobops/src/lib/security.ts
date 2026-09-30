import { createHash, timingSafeEqual } from "node:crypto";
export const accessCookie = "jobops_access";
export function credentialDigest(token:string){return createHash("sha256").update(`jobops-access:${token}`).digest("hex");}
export function equalCredential(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length && timingSafeEqual(aa,bb);}
export function isLoopback(hostname:string){return ["localhost","127.0.0.1","[::1]","::1"].includes(hostname.toLowerCase());}
export function configuredOrigin(){return new URL(process.env.APP_URL ?? "http://127.0.0.1:3210").origin;}
export function safeOrigin(origin:string|null){if(!origin)return false;try{return new URL(origin).origin===configuredOrigin();}catch{return false;}}
