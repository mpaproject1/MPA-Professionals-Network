import "./globals.css";
import type {Metadata} from "next";
import {Providers} from "../components/providers";
import {Shell} from "../components/shell";

export const metadata:Metadata={title:"MPA | Trusted Professional Network",description:"Ethiopian Muslim Professionals Association enterprise platform",manifest:"/manifest.webmanifest",appleWebApp:{capable:true,title:"MPA",statusBarStyle:"default"},icons:{apple:[{url:"/brand/mpa-favicon-light.svg",type:"image/svg+xml"}],icon:[{url:"/brand/mpa-favicon-light.svg",media:"(prefers-color-scheme: light)",type:"image/svg+xml"},{url:"/brand/mpa-favicon-dark.svg",media:"(prefers-color-scheme: dark)",type:"image/svg+xml"}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning style={{"--font-inter":"Inter, Segoe UI, Arial, sans-serif","--font-manrope":"Manrope, Segoe UI, Arial, sans-serif","--font-ethiopic":"Noto Sans Ethiopic, Nyala, sans-serif"} as React.CSSProperties}><body><Providers><Shell>{children}</Shell></Providers></body></html>}