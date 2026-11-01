import "./globals.css";
import type {Metadata,Viewport} from "next";
import {Providers} from "../components/providers";
import {Shell} from "../components/shell";

export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#0A3258"};
export const metadata:Metadata={title:"MPA | Trusted Professional Network",description:"Ethiopian Muslim Professionals Association enterprise platform",manifest:"/manifest.webmanifest",appleWebApp:{capable:true,title:"MPA",statusBarStyle:"default"},icons:{apple:[{url:"/brand/mpa-pwa-icon.svg",type:"image/svg+xml"}],icon:[{url:"/brand/mpa-favicon-light.svg",media:"(prefers-color-scheme: light)",type:"image/svg+xml"},{url:"/brand/mpa-favicon-dark.svg",media:"(prefers-color-scheme: dark)",type:"image/svg+xml"}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning className="font-fallback"><body><Providers><Shell>{children}</Shell></Providers></body></html>}