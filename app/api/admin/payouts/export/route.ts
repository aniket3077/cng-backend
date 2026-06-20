import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/admin/payouts/export
 * Exports withdrawal records as a CSV report.
 */
export async function GET(request: NextRequest) {
  try {
    const adminPayload = await requireAdmin(request);
    if (!adminPayload) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || '';
    const overdue = searchParams.get('overdue') === 'true';
    const now = new Date();

    // Build the query where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (overdue) {
      where.payoutDeadline = { lt: now };
      where.status = { in: ['pending', 'processing'] };
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { upiId: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const withdrawals = await prisma.withdrawal.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    // Generate CSV Content
    const csvHeaders = [
      'Withdrawal ID',
      'User Name',
      'User Email',
      'User Phone',
      'Amount (INR)',
      'Payment Method',
      'UPI ID',
      'Bank Name',
      'Account Number',
      'IFSC Code',
      'Status',
      'Request Date',
      'Deadline',
      'Approved Date',
      'Paid Date',
      'Rejected Date',
      'Admin Remarks',
    ];

    const escapeCsv = (str?: string | null) => {
      if (!str) return '';
      // Escape double quotes and wrap in quotes if commas or quotes exist
      const escaped = str.replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
        ? `"${escaped}"`
        : escaped;
    };

    const csvRows = [csvHeaders.join(',')];

    for (const w of withdrawals) {
      const row = [
        w.id,
        escapeCsv(w.user.name),
        escapeCsv(w.user.email),
        escapeCsv(w.user.phone),
        w.amount.toString(),
        w.paymentMethod,
        escapeCsv(w.upiId),
        escapeCsv(w.bankName),
        escapeCsv(w.accountNumber ? `"${w.accountNumber}"` : ''), // escape account number formatting
        escapeCsv(w.ifscCode),
        w.status,
        w.requestedAt.toISOString(),
        w.payoutDeadline.toISOString(),
        w.approvedAt?.toISOString() || '',
        w.paidAt?.toISOString() || '',
        w.rejectedAt?.toISOString() || '',
        escapeCsv(w.adminRemarks),
      ];
      csvRows.push(row.join(','));
    }

    const csvString = csvRows.join('\n');

    return new Response(csvString, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="withdrawal_report_${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting payouts:', error);
    return new Response('Internal server error', { status: 500, headers: corsHeaders });
  }
}
