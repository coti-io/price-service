export const corsConfig = {
  origin: ['http://localhost:3000', '*'],
  credentials: true,
};

export const appModuleConfig = {
  cors: corsConfig,
};
