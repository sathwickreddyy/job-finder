import {NextRequest,NextResponse} from "next/server";
import {accessCookie,credentialDigest,equalCredential,isLoopback,safeOrigin} from "@/lib/security";
export function proxy(request:NextRequest){
  const appUrl=new URL(process.env.APP_URL ?? "http://127.0.0.1:3210");
  let host:URL;try{host=new URL(`http://${request.headers.get("host") ?? "invalid"}`);}catch{return new NextResponse("Invalid host",{status:400});}
  if(host.host!==appUrl.host && !(isLoopback(host.hostname)&&isLoopback(appUrl.hostname)&&host.port===appUrl.port))return new NextResponse("Host is not allowed. Configure APP_URL for your deployment.",{status:403});
  if(!["GET","HEAD","OPTIONS"].includes(request.method)&&!safeOrigin(request.headers.get("origin")))return new NextResponse("Request origin is not allowed. Reload JobOps and retry.",{status:403});
  const token=process.env.JOBOPS_ACCESS_TOKEN;
  if(!token && (!isLoopback(appUrl.hostname)||!isLoopback(host.hostname)))return new NextResponse("Set JOBOPS_ACCESS_TOKEN before exposing JobOps beyond loopback.",{status:503});
  if(token && token.length<32)return new NextResponse("JOBOPS_ACCESS_TOKEN must contain at least 32 characters.",{status:503});
  if(token && request.nextUrl.pathname!=="/unlock" && request.nextUrl.pathname!=="/api/unlock"){
    const provided=request.cookies.get(accessCookie)?.value ?? "";
    if(!equalCredential(provided,credentialDigest(token))){
      if(request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname.endsWith(".json"))return NextResponse.json({error:"Unlock JobOps in this browser first."},{status:401});
      return NextResponse.redirect(new URL("/unlock",request.url));
    }
  }
  return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
