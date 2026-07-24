import { useEffect, useState } from "react";
import { api } from "./api";
import type { SessionUser } from "./types";

/** All family accounts, for the Mediathek/Verlauf "who downloaded this" filter. */
export function useUsers(): SessionUser[] {
  const [users, setUsers] = useState<SessionUser[]>([]);

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  return users;
}
