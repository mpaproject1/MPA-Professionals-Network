import { api } from "./api";

const ALLOWED_TYPES=new Set(["application/pdf","image/png","image/jpeg","text/plain"]);
const MAX_BYTES=10*1024*1024;

export async function uploadPrivateFile(token:string,file:File):Promise<string>{
 if(!ALLOWED_TYPES.has(file.type))throw new Error("Choose a PDF, PNG, JPEG or plain-text file.");
 if(file.size<1||file.size>MAX_BYTES)throw new Error("Choose a file between 1 byte and 10 MiB.");
 const bytes=await file.arrayBuffer();
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 const checksumSha256=Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,"0")).join("");
 const upload=await api<{uploadId:string;uploadToken:string;uploadUrl:string}>("/api/v1/files/uploads",{method:"POST",body:JSON.stringify({fileName:file.name,contentType:file.type,byteSize:file.size,checksumSha256})},token);
 const response=await fetch(upload.uploadUrl,{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/octet-stream","X-Upload-Token":upload.uploadToken},body:file,cache:"no-store"});
 if(!response.ok)throw new Error("Private file upload failed. Retry without changing the case or application.");
 const confirmed=await api<{id:string}>(`/api/v1/files/uploads/${encodeURIComponent(upload.uploadId)}/confirm`,{method:"POST"},token);
 return confirmed.id;
}
