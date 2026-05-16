import { NextRequest, NextResponse } from 'next/server';

// TODO: Install and configure email service
// npm install nodemailer
// or use a service like Resend, SendGrid, etc.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, username, email, password } = body;

    // TODO: Validate input
    if (!name || !username || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // TODO: Check if user already exists in database
    // const existingUser = await db.user.findUnique({ where: { email } });
    // if (existingUser) {
    //   return NextResponse.json(
    //     { error: 'Email already registered' },
    //     { status: 400 }
    //   );
    // }

    // TODO: Hash password
    // const hashedPassword = await bcrypt.hash(password, 12);

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // TODO: Store user in database with verification code
    // await db.user.create({
    //   data: {
    //     name,
    //     username,
    //     email,
    //     password: hashedPassword,
    //     verificationCode,
    //     verificationCodeExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    //     verified: false,
    //   },
    // });

    // TODO: Send verification email
    // await sendVerificationEmail(email, verificationCode);

    // For now, just return success (development mode)
    console.log('Verification code for', email, ':', verificationCode);

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to email',
      // In development, return the code (remove in production!)
      devCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
