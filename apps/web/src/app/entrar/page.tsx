import { LoginFlow } from "@/components/login-flow";
export const metadata = { title: "Entrar" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginFlow accessError={error} />;
}
