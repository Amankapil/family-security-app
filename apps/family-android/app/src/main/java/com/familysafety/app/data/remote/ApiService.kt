package com.familysafety.app.data.remote

import com.familysafety.app.data.model.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface ApiService {

    // Device Pairing (Public endpoint with ephemeral token)
    @POST("/api/v1/pairing/complete")
    suspend fun completePairing(
        @Body request: CompletePairingRequest
    ): Response<ApiResponse<PairingResponseData>>

    // Telemetry Heartbeat (Authenticated with X-Device headers)
    @POST("/api/v1/devices/heartbeat")
    suspend fun sendHeartbeat(
        @Body request: HeartbeatRequest
    ): Response<ApiResponse<Any>>

    // SOS Trigger (Authenticated with X-Device headers)
    @POST("/api/v1/sos")
    suspend fun triggerSos(
        @Body request: SosRequest
    ): Response<ApiResponse<Any>>

    // "I'm OK" Safe Signal
    @POST("/api/v1/status/im-ok")
    suspend fun sendImOk(
        @Body request: ImOkRequest
    ): Response<ApiResponse<Any>>

    // Upload location fixes (single or batch)
    @POST("/api/v1/locations")
    suspend fun uploadLocations(
        @Body locations: List<LocationFixPayload>
    ): Response<ApiResponse<Any>>

    // Sync FCM Push Token
    @POST("/api/v1/devices/fcm-token")
    suspend fun updateFcmToken(
        @Body request: Map<String, String>
    ): Response<ApiResponse<Any>>
}
