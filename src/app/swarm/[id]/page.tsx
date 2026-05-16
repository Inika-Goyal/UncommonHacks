import { SwarmLaunch } from "@/components/swarm-launch";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SwarmLaunchPage({ params }: Props) {
  const { id } = await params;
  return <SwarmLaunch reportId={id} />;
}
