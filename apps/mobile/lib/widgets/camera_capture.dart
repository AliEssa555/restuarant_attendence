import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Live front-camera capture with a face guide.
///
/// There is deliberately **no gallery picker anywhere in this app**: a check-in
/// photo has to be taken now, in the restaurant, in front of the poster. Letting
/// an employee pick a saved image would defeat the entire verification design.
class CameraCaptureView extends StatefulWidget {
  const CameraCaptureView({
    required this.instruction,
    required this.onCaptured,
    this.busy = false,
    super.key,
  });

  /// Shown under the oval, e.g. "Make sure the poster is visible behind you".
  final String instruction;

  /// Called with the captured JPEG. The caller owns the file.
  final Future<void> Function(File jpeg) onCaptured;

  /// Disables the shutter while the caller is working.
  final bool busy;

  @override
  State<CameraCaptureView> createState() => _CameraCaptureViewState();
}

class _CameraCaptureViewState extends State<CameraCaptureView>
    with WidgetsBindingObserver {
  CameraController? _controller;
  String? _error;
  bool _permissionDenied = false;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // The face crop assumes an upright frame; a rotated capture would be
    // cropped against the wrong axis.
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null) return;
    // Android reclaims the camera when the app is backgrounded, so the
    // controller has to be rebuilt rather than resumed.
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      _controller = null;
      if (mounted) setState(() {});
    } else if (state == AppLifecycleState.resumed) {
      _start();
    }
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _permissionDenied = false;
    });

    final status = await Permission.camera.request();
    if (!status.isGranted) {
      if (!mounted) return;
      setState(() => _permissionDenied = true);
      return;
    }

    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (!mounted) return;
        setState(() => _error = 'This device has no camera.');
        return;
      }
      final front = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        front,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      await controller.lockCaptureOrientation(DeviceOrientation.portraitUp);

      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } on CameraException catch (err) {
      if (!mounted) return;
      setState(() => _error = 'Camera error: ${err.description ?? err.code}');
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _capturing || widget.busy) return;
    setState(() => _capturing = true);
    try {
      final shot = await controller.takePicture();
      await widget.onCaptured(File(shot.path));
    } on CameraException catch (err) {
      if (!mounted) return;
      setState(() => _error = 'Could not take the photo: ${err.code}');
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_permissionDenied) return _PermissionRationale(onRetry: _start);
    if (_error != null) return _CameraError(message: _error!, onRetry: _start);

    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const Center(child: CircularProgressIndicator());
    }

    final busy = widget.busy || _capturing;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Cover rather than contain: a letterboxed preview makes people hold
        // the phone further away, which shrinks the face below the size the
        // model needs.
        FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: controller.value.previewSize?.height ?? 720,
            height: controller.value.previewSize?.width ?? 1280,
            child: CameraPreview(controller),
          ),
        ),
        const _FaceOvalOverlay(),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: _CaptureBar(
            instruction: widget.instruction,
            busy: busy,
            onCapture: _capture,
          ),
        ),
      ],
    );
  }
}

/// A dimmed frame with a clear oval, so the employee centres their face without
/// needing to read anything.
class _FaceOvalOverlay extends StatelessWidget {
  const _FaceOvalOverlay();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final ovalWidth = constraints.maxWidth * 0.68;
          final ovalHeight = ovalWidth * 1.32;
          return ColoredBox(
            color: Colors.black54,
            child: Center(
              child: Container(
                width: ovalWidth,
                height: ovalHeight,
                margin: EdgeInsets.only(bottom: constraints.maxHeight * 0.08),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white70, width: 2.5),
                  // Punches the oval out of the dim layer.
                  backgroundBlendMode: BlendMode.dstOut,
                  color: Colors.white,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CaptureBar extends StatelessWidget {
  const _CaptureBar({
    required this.instruction,
    required this.busy,
    required this.onCapture,
  });

  final String instruction;
  final bool busy;
  final VoidCallback onCapture;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Colors.black87],
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              instruction,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15.5,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 22),
            GestureDetector(
              onTap: busy ? null : onCapture,
              child: Container(
                width: 74,
                height: 74,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: busy ? Colors.white24 : Colors.white,
                  border: Border.all(color: Colors.white, width: 3),
                ),
                child: busy
                    ? const Padding(
                        padding: EdgeInsets.all(22),
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.camera_alt, size: 30),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Camera permission was refused. Explaining *why* the app needs it converts
/// far better than re-prompting, and a permanent denial can only be undone in
/// system settings.
class _PermissionRationale extends StatelessWidget {
  const _PermissionRationale({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.no_photography_outlined,
                size: 56, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 20),
            Text('Camera access needed',
                style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 10),
            Text(
              'Face check-in works by taking a photo of you in front of the '
              'restaurant poster. The photo is only visible to your manager.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: onRetry, child: const Text('Allow camera')),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: openAppSettings,
              child: const Text('Open app settings'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.videocam_off_outlined,
                size: 56, color: theme.colorScheme.error),
            const SizedBox(height: 18),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 22),
            FilledButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
