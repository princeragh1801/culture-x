import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { User, Wallet, WalletBalance } from '../db/models';
import { app, createUser } from './helpers';

describe('authentication', () => {
  const password = 'correct-horse-battery';

  describe('signup', () => {
    it('creates the user and their wallet, with a zero balance in every currency', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'someone@example.test', password, name: 'Someone' })
        .expect(201);

      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.user.email).toBe('someone@example.test');
      // The hash must never leave the server.
      expect(JSON.stringify(response.body)).not.toContain('$2');

      const wallet = await Wallet.findOne({ where: { userId: response.body.user.id } });
      expect(wallet).not.toBeNull();

      const balances = await WalletBalance.findAll({ where: { walletId: wallet!.id } });
      expect(balances).toHaveLength(3);
      expect(balances.every((row) => row.balance === 0)).toBe(true);
    });

    it('normalises the email, so casing cannot create a second account', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: '  Mixed@Example.TEST  ', password })
        .expect(201);

      expect(await User.count({ where: { email: 'mixed@example.test' } })).toBe(1);

      const duplicate = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'MIXED@example.test', password })
        .expect(409);

      expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect(await User.count()).toBe(1);
    });

    it('lets exactly one of five simultaneous signups win', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).post('/api/auth/signup').send({ email: 'race@example.test', password }),
        ),
      );

      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4);

      expect(await User.count()).toBe(1);
      expect(await Wallet.count()).toBe(1);
      expect(await WalletBalance.count()).toBe(3);
    });

    it.each([
      ['not-an-email', password, 'email'],
      ['valid@example.test', 'short', 'password'],
    ])('rejects %s / %s', async (email, pw, field) => {
      const response = await request(app).post('/api/auth/signup').send({ email, password: pw }).expect(422);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    });
  });

  describe('login', () => {
    it('returns a working token for the right password', async () => {
      await request(app).post('/api/auth/signup').send({ email: 'login@example.test', password }).expect(201);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@example.test', password })
        .expect(200);

      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.body.token as string}`)
        .expect(200);
    });

    /**
     * Both cases must be indistinguishable, or the endpoint becomes a way to
     * discover which emails have accounts.
     */
    it('answers identically for a wrong password and an unknown email', async () => {
      await request(app).post('/api/auth/signup').send({ email: 'known@example.test', password }).expect(201);

      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'known@example.test', password: 'not-the-password' })
        .expect(401);

      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('route protection', () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/auth/me' },
      { method: 'get', path: '/api/currencies' },
      { method: 'get', path: '/api/wallet' },
      { method: 'get', path: '/api/wallet/ledger' },
      { method: 'get', path: '/api/credits/purchases' },
      { method: 'post', path: '/api/credits/purchases' },
      { method: 'get', path: '/api/campaigns' },
      { method: 'post', path: '/api/campaigns' },
      { method: 'post', path: '/api/campaigns/1/fund' },
    ] as const;

    it.each(protectedRoutes)('$method $path requires a token', async ({ method, path }) => {
      const response =
        method === 'get' ? await request(app).get(path) : await request(app).post(path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it.each([
      ['a garbage token', 'Bearer not-a-jwt'],
      ['a missing Bearer prefix', 'just-a-token'],
      ['an empty Bearer', 'Bearer '],
    ])('rejects %s', async (_label, header) => {
      await request(app).get('/api/wallet').set('Authorization', header).expect(401);
    });

    it('rejects a token whose signature has been altered', async () => {
      const user = await createUser();
      const tampered = `${user.token.slice(0, -4)}AAAA`;

      await request(app).get('/api/wallet').set('Authorization', `Bearer ${tampered}`).expect(401);
    });
  });
});
