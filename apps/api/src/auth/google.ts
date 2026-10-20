import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../config/prisma';
import { getEnv } from '../config/env';
import { UserRole } from '@prisma/client';

const env = getEnv();

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
      scope: ['profile', 'email'],
      state: true,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const googleSubject = profile.id;
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value;

        if (!email) {
          return done(new Error('Google profile missing email'), false);
        }

        let user = await prisma.user.findUnique({ where: { googleSubject } });

        if (!user) {
          user = await prisma.user.findUnique({ where: { email } });
          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleSubject, avatarUrl, lastLoginAt: new Date() },
            });
          } else {
            user = await prisma.user.create({
              data: { googleSubject, email, name, avatarUrl, role: UserRole.USER, lastLoginAt: new Date() },
            });
          }
        } else {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { name, avatarUrl, lastLoginAt: new Date() },
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

export { passport };