import 'package:flutter/material.dart';

/// Shown while auth state, claims and the employee document are still loading.
///
/// The route gate sends everything here first, so this is also what an employee
/// sees for a moment on a cold start.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.schedule_rounded, size: 64, color: scheme.primary),
            const SizedBox(height: 24),
            Text('Attendance', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 32),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          ],
        ),
      ),
    );
  }
}
