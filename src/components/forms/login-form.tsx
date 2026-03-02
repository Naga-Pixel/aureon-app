"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const redirect = searchParams.get("redirect") || "/installer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message === "Invalid login credentials"
            ? "Email o contrasena incorrectos"
            : err.message
          : "Error al iniciar sesion"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(error || errorParam) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-red-700 text-sm">
          {error ||
            (errorParam === "no_access" &&
              "No tienes acceso a esta area. Contacta con el administrador.")}
        </div>
      )}

      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        required
        autoComplete="email"
      />

      <Input
        label="Contrasena"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        required
        autoComplete="current-password"
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        isLoading={isLoading}
        disabled={isLoading}
      >
        {isLoading ? "Iniciando sesion..." : "Iniciar sesion"}
      </Button>
    </form>
  );
}
