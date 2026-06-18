"use client";

import { createContext, useContext } from "react";

/**
 * Lets product surfaces inside a chat reply (cards + inline `product:<id>`
 * links) open the shared product detail dialog. Provided by
 * `ChatProductDialogProvider`. The default is a no-op so components never crash
 * when rendered outside the provider (e.g. in isolation tests).
 */
export interface ChatProductContextValue {
  openProduct: (id: string) => void;
}

const ChatProductContext = createContext<ChatProductContextValue>({
  openProduct: () => undefined,
});

export const ChatProductProvider = ChatProductContext.Provider;

export function useChatProduct(): ChatProductContextValue {
  return useContext(ChatProductContext);
}
