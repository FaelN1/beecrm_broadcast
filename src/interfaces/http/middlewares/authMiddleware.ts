import { Request, Response, NextFunction } from 'express';

// Token fixo para autenticação
const API_TOKEN = 'broadcast-api-token-2025';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      error: 'Não autorizado: Token não fornecido' 
    });
  }

  if (token !== API_TOKEN) {
    return res.status(403).json({ 
      error: 'Acesso proibido: Token inválido' 
    });
  }

  next();
};