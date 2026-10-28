import { NextResponse } from 'next/server';
import { AuthError } from './auth';

/** Converte erros conhecidos em respostas HTTP; qualquer outro vira 500 sem vazar detalhes. */
export function handleError(error: unknown): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 });
}

export class HttpError extends Error {
  constructor(public status: 400 | 404 | 409 | 429 | 503, message: string) {
    super(message);
  }
}
