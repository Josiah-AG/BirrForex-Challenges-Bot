import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    // TODO: Verify code from database
    // const user = await db.user.findUnique({
    //   where: { email },
    // });

    // if (!user) {
    //   return NextResponse.json(
    //     { error: 'User not found' },
    //     { status: 404 }
    //   );
    // }

    // if (user.verificationCode !== code) {
    //   return NextResponse.json(
    //     { error: 'Invalid verification code' },
    //     { status: 400 }
    //   );
    // }

    // if (new Date() > user.verificationCodeExpiry) {
    //   return NextResponse.json(
    //     { error: 'Verification code expired' },
    //     { status: 400 }
    //   );
    // }

    // TODO: Mark user as verified
    // await db.user.update({
    //   where: { email },
    //   data: {
    //     verified: true,
    //     verificationCode: null,
    //     verificationCodeExpiry: null,
    //   },
    // });

    // For now, accept any 6-digit code (development mode)
    if (code.length === 6) {
      return NextResponse.json({
        success: true,
        message: 'Email verified successfully',
      });
    }

    return NextResponse.json(
      { error: 'Invalid verification code' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
