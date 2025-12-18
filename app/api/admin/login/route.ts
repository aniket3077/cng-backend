import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { email, password } = validation.data;

    // Find admin
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    console.log('🔍 Login attempt:', { email, foundAdmin: !!admin });

    if (!admin) {
      console.log('❌ Admin not found');
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify password
    console.log('🔑 Comparing password...');
    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);
    console.log('🔑 Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('❌ Password mismatch');
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Generate JWT token
    const token = signJwt({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    return NextResponse.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}
