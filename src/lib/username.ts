// Folds "Kaden Li", "KadenLi" and "kaden.li" to the same key.
export const usernameKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
