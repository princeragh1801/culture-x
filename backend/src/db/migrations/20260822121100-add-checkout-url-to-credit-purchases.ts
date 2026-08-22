import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Stores the Checkout Session URL alongside its session id.
 *
 * Without it, a retried POST /api/credits/purchases carrying the same
 * Idempotency-Key could find the existing purchase but have nothing to send the
 * browser to. Stripe sessions expire (24 hours by default), so a stored URL is a
 * resume link, not a permanent one — an expired session is replaced by creating
 * a new purchase.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('credit_purchases', 'stripe_checkout_url', {
    type: DataTypes.STRING(2048),
    allowNull: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('credit_purchases', 'stripe_checkout_url');
}
