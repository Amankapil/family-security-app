package com.familysafety.app.data.model

import com.google.gson.annotations.SerializedName

// Pairing Request
data class CompletePairingRequest(
    @SerializedName("pairingToken") val pairingToken: String,
    @SerializedName("deviceName") val deviceName: String,
    @SerializedName("manufacturer") val manufacturer: String,
    @SerializedName("model") val model: String,
    @SerializedName("androidVersion") val androidVersion: String,
    @SerializedName("appVersion") val appVersion: String,
    @SerializedName("fcmToken") val fcmToken: String? = null,
    @SerializedName("permissions") val permissions: DevicePermissionsPayload? = null
)

data class DevicePermissionsPayload(
    @SerializedName("fineLocation") val fineLocation: Boolean,
    @SerializedName("backgroundLocation") val backgroundLocation: Boolean,
    @SerializedName("notifications") val notifications: Boolean,
    @SerializedName("batteryOptimizationDisabled") val batteryOptimizationDisabled: Boolean
)

// Pairing Response
data class ApiResponse<T>(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: T?,
    @SerializedName("error") val error: String?
)

data class PairingResponseData(
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("deviceToken") val deviceToken: String,
    @SerializedName("member") val member: MemberInfo,
    @SerializedName("family") val family: FamilyInfo
)

data class MemberInfo(
    @SerializedName("id") val id: String,
    @SerializedName("displayName") val displayName: String,
    @SerializedName("role") val role: String
)

data class FamilyInfo(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String
)

// Heartbeat Request
data class HeartbeatRequest(
    @SerializedName("batteryLevel") val batteryLevel: Int,
    @SerializedName("isCharging") val isCharging: Boolean,
    @SerializedName("networkType") val networkType: String,
    @SerializedName("fcmToken") val fcmToken: String? = null,
    @SerializedName("permissions") val permissions: DevicePermissionsPayload? = null
)

// SOS Request
data class SosRequest(
    @SerializedName("latitude") val latitude: Double,
    @SerializedName("longitude") val longitude: Double,
    @SerializedName("accuracy") val accuracy: Float,
    @SerializedName("batteryLevel") val batteryLevel: Int,
    @SerializedName("triggerType") val triggerType: String = "MANUAL_SOS"
)

// "I'm OK" Request
data class ImOkRequest(
    @SerializedName("latitude") val latitude: Double? = null,
    @SerializedName("longitude") val longitude: Double? = null,
    @SerializedName("note") val note: String? = "I'm safe and OK"
)

// Location Ingestion Payload
data class LocationFixPayload(
    @SerializedName("latitude") val latitude: Double,
    @SerializedName("longitude") val longitude: Double,
    @SerializedName("accuracy") val accuracy: Float,
    @SerializedName("speed") val speed: Float = 0f,
    @SerializedName("heading") val heading: Float = 0f,
    @SerializedName("altitude") val altitude: Double = 0.0,
    @SerializedName("batteryLevel") val batteryLevel: Int? = null,
    @SerializedName("networkType") val networkType: String? = null,
    @SerializedName("timestamp") val timestamp: String? = null
)

