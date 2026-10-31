import "./globals.css";
import type {Metadata} from "next";
import { Inter, Manrope, Noto_Sans_Ethiopic } from "next/font/google";
import {Providers} from "../components/providers";
import {Shell} from "../components/shell";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-manrope" });
const notoEthiopic = Noto_Sans_Ethiopic({ subsets: ["ethiopic"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-ethiopic" });
export const metadata:Metadata={title:"MPA | Trusted Professional Network",description:"Ethiopian Muslim Professionals Association enterprise platform",manifest:"/manifest.webmanifest",appleWebApp:{capable:true,title:"MPA",statusBarStyle:"default"},icons:{apple:[{url:"/brand/mpa-favicon-light.svg",type:"image/svg+xml"}],icon:[{url:"/brand/mpa-favicon-light.svg",media:"(prefers-color-scheme: light)",type:"image/svg+xml"},{url:"/brand/mpa-favicon-dark.svg",media:"(prefers-color-scheme: dark)",type:"image/svg+xml"}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning className={`${inter.variable} ${manrope.variable} ${notoEthiopic.variable}`}><body><Providers><Shell>{children}</Shell></Providers></body></html>}