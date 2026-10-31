import 'package:cloud_firestore/cloud_firestore.dart';

/// Read models for the Firestore documents the app consumes.
///
/// The app never writes these — attendance, presence and face state are all
/// server-owned — so each model only needs a `fromSnapshot`.

enum Role { owner, manager, employee, unknown }

Role roleFromString(String? value) => switch (value) {
      'owner' => Role.owner,
      'manager' => Role.manager,
      'employee' => Role.employee,
      _ => Role.unknown,
    };

enum AttendanceMode { manual, face, both }

AttendanceMode attendanceModeFromString(String? value) => switch (value) {
      'manual' => AttendanceMode.manual,
      'face' => AttendanceMode.face,
      _ => AttendanceMode.both,
    };

enum FaceStatus { none, pending, approved, rejected }

FaceStatus faceStatusFromString(String? value) => switch (value) {
      'pending' => FaceStatus.pending,
      'approved' => FaceStatus.approved,
      'rejected' => FaceStatus.rejected,
      _ => FaceStatus.none,
    };

enum PresenceStatus { inside, outside }

PresenceStatus presenceFromString(String? value) =>
    value == 'in' ? PresenceStatus.inside : PresenceStatus.outside;

enum AttendanceType { checkIn, checkOut }

String attendanceTypeToWire(AttendanceType type) =>
    type == AttendanceType.checkIn ? 'check_in' : 'check_out';

enum AttendanceStatus { verified, pendingReview, rejected }

AttendanceStatus attendanceStatusFromString(String? value) => switch (value) {
      'pending_review' => AttendanceStatus.pendingReview,
      'rejected' => AttendanceStatus.rejected,
      _ => AttendanceStatus.verified,
    };

enum AttendanceMethod { manual, face }

/// The signed-in account, mirrored from `users/{uid}`.
class AppUser {
  const AppUser({
    required this.uid,
    required this.role,
    required this.restaurantId,
    required this.displayName,
    required this.email,
    required this.mustChangePassword,
    this.employeeId,
  });

  final String uid;
  final Role role;
  final String restaurantId;
  final String displayName;
  final String email;
  final bool mustChangePassword;
  final String? employeeId;

  factory AppUser.fromSnapshot(DocumentSnapshot<Map<String, dynamic>> snap) {
    final d = snap.data() ?? const {};
    return AppUser(
      uid: snap.id,
      role: roleFromString(d['role'] as String?),
      restaurantId: (d['restaurantId'] as String?) ?? '',
      displayName: (d['displayName'] as String?) ?? '',
      email: (d['email'] as String?) ?? '',
      mustChangePassword: (d['mustChangePassword'] as bool?) ?? false,
      employeeId: d['employeeId'] as String?,
    );
  }
}

/// `restaurants/{rid}` — the settings the app needs to shape its own UI.
class Restaurant {
  const Restaurant({
    required this.id,
    required this.name,
    required this.timezone,
    required this.attendanceMode,
    this.requireLocation = true,
    this.locationLat = 0,
    this.locationLng = 0,
    this.locationRadiusMeters = 100,
  });

  final String id;
  final String name;
  final String timezone;
  final AttendanceMode attendanceMode;
  final bool requireLocation;
  final double locationLat, locationLng, locationRadiusMeters;

  bool get allowsManual =>
      attendanceMode == AttendanceMode.manual || attendanceMode == AttendanceMode.both;
  bool get allowsFace =>
      attendanceMode == AttendanceMode.face || attendanceMode == AttendanceMode.both;

  factory Restaurant.fromSnapshot(DocumentSnapshot<Map<String, dynamic>> snap) {
    final d = snap.data() ?? const {};
    final settings = (d['settings'] as Map<String, dynamic>?) ?? const {};
    return Restaurant(
      id: snap.id,
      name: (d['name'] as String?) ?? 'Restaurant',
      timezone: (d['timezone'] as String?) ?? 'Asia/Karachi',
      requireLocation: settings['requireLocation'] as bool? ?? true,
      locationLat: (settings['locationLat'] as num?)?.toDouble() ?? 0,
      locationLng: (settings['locationLng'] as num?)?.toDouble() ?? 0,
      locationRadiusMeters: (settings['locationRadiusMeters'] as num?)?.toDouble() ?? 100,
      attendanceMode: attendanceModeFromString(settings['attendanceMode'] as String?),
    );
  }
}

/// `restaurants/{rid}/employees/{eid}` — the employee's own record.
class Employee {
  const Employee({
    required this.id,
    required this.name,
    required this.email,
    required this.active,
    required this.faceStatus,
    required this.presence,
    this.position,
    this.phone,
    this.scheduledStart,
    this.faceModelVersion,
    this.lastEventAt,
    this.enrolPhotoPath,
  });

  final String id;
  final String name;
  final String email;
  final bool active;
  final FaceStatus faceStatus;
  final PresenceStatus presence;
  final String? position;
  final String? phone;
  final String? scheduledStart;
  final String? faceModelVersion;
  final DateTime? lastEventAt;
  final String? enrolPhotoPath;

  bool get isCheckedIn => presence == PresenceStatus.inside;

  /// Face check-in is only possible once a manager has approved the enrolment
  /// *and* the approved embedding came from the model this build carries.
  bool canUseFace(String currentModelVersion) =>
      faceStatus == FaceStatus.approved && faceModelVersion == currentModelVersion;

  bool get needsEnrolment =>
      faceStatus == FaceStatus.none || faceStatus == FaceStatus.rejected;

  factory Employee.fromSnapshot(DocumentSnapshot<Map<String, dynamic>> snap) {
    final d = snap.data() ?? const {};
    final face = (d['face'] as Map<String, dynamic>?) ?? const {};
    final presence = (d['presence'] as Map<String, dynamic>?) ?? const {};
    return Employee(
      id: snap.id,
      name: (d['name'] as String?) ?? '',
      email: (d['email'] as String?) ?? '',
      active: (d['active'] as bool?) ?? true,
      faceStatus: faceStatusFromString(face['status'] as String?),
      presence: presenceFromString(presence['status'] as String?),
      position: d['position'] as String?,
      phone: d['phone'] as String?,
      scheduledStart: d['scheduledStart'] as String?,
      faceModelVersion: face['modelVersion'] as String?,
      enrolPhotoPath: face['enrolPhotoPath'] as String?,
      lastEventAt: (presence['lastEventAt'] as Timestamp?)?.toDate(),
    );
  }
}

/// `restaurants/{rid}/attendance/{id}` — one check-in or check-out.
class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.type,
    required this.method,
    required this.status,
    required this.createdAt,
    required this.localDate,
    this.rejectReason,
    this.late = false,
    this.minutesLate = 0,
    this.similarity,
    this.markerValid,
  });

  final String id;
  final AttendanceType type;
  final AttendanceMethod method;
  final AttendanceStatus status;
  final DateTime createdAt;
  final String localDate;
  final String? rejectReason;
  final bool late;
  final int minutesLate;
  final double? similarity;
  final bool? markerValid;

  factory AttendanceRecord.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snap,
  ) {
    final d = snap.data() ?? const {};
    final face = d['face'] as Map<String, dynamic>?;
    return AttendanceRecord(
      id: snap.id,
      type: d['type'] == 'check_out' ? AttendanceType.checkOut : AttendanceType.checkIn,
      method: d['method'] == 'face' ? AttendanceMethod.face : AttendanceMethod.manual,
      status: attendanceStatusFromString(d['status'] as String?),
      // `createdAt` is written with the server clock; it can briefly read as
      // null from the local cache before the write round-trips.
      createdAt: (d['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      localDate: (d['localDate'] as String?) ?? '',
      rejectReason: d['rejectReason'] as String?,
      late: (d['late'] as bool?) ?? false,
      minutesLate: (d['minutesLate'] as num?)?.toInt() ?? 0,
      similarity: (face?['similarity'] as num?)?.toDouble(),
      markerValid: face?['markerValid'] as bool?,
    );
  }
}

/// What `recordAttendance` returns.
class AttendanceOutcome {
  const AttendanceOutcome({
    required this.recordId,
    required this.status,
    this.rejectReason,
    this.similarity,
    this.late = false,
    this.minutesLate = 0,
    this.duplicate = false,
  });

  final String recordId;
  final AttendanceStatus status;
  final String? rejectReason;
  final double? similarity;
  final bool late;
  final int minutesLate;
  final bool duplicate;

  factory AttendanceOutcome.fromCallable(Map<String, dynamic> data) {
    return AttendanceOutcome(
      recordId: (data['recordId'] as String?) ?? '',
      status: attendanceStatusFromString(data['status'] as String?),
      rejectReason: data['rejectReason'] as String?,
      similarity: (data['similarity'] as num?)?.toDouble(),
      late: (data['late'] as bool?) ?? false,
      minutesLate: (data['minutesLate'] as num?)?.toInt() ?? 0,
      duplicate: (data['duplicate'] as bool?) ?? false,
    );
  }
}
