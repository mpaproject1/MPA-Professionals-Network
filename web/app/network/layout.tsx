import { NetworkPlusAccessGuard } from "../../components/network-plus-access-guard";

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return <NetworkPlusAccessGuard>{children}</NetworkPlusAccessGuard>;
}
