package com.familysafety.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        // Fallback for devices with hardware Keystore anomalies
        context.getSharedPreferences(PREFS_FILE_NAME + "_fallback", Context.MODE_PRIVATE)
    }

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var deviceToken: String?
        get() = prefs.getString(KEY_DEVICE_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_TOKEN, value).apply()

    var memberName: String?
        get() = prefs.getString(KEY_MEMBER_NAME, null)
        set(value) = prefs.edit().putString(KEY_MEMBER_NAME, value).apply()

    var memberId: String?
        get() = prefs.getString(KEY_MEMBER_ID, null)
        set(value) = prefs.edit().putString(KEY_MEMBER_ID, value).apply()

    var familyId: String?
        get() = prefs.getString(KEY_FAMILY_ID, null)
        set(value) = prefs.edit().putString(KEY_FAMILY_ID, value).apply()

    var familyName: String?
        get() = prefs.getString(KEY_FAMILY_NAME, null)
        set(value) = prefs.edit().putString(KEY_FAMILY_NAME, value).apply()

    var apiUrl: String
        get() = prefs.getString(KEY_API_URL, DEFAULT_API_URL) ?: DEFAULT_API_URL
        set(value) = prefs.edit().putString(KEY_API_URL, value).apply()

    var fcmToken: String?
        get() = prefs.getString(KEY_FCM_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_FCM_TOKEN, value).apply()

    val isPaired: Boolean
        get() = !deviceId.isNullOrEmpty() && !deviceToken.isNullOrEmpty()

    fun savePairingSession(
        deviceId: String,
        deviceToken: String,
        memberId: String,
        memberName: String,
        familyId: String,
        familyName: String,
        customApiUrl: String? = null
    ) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .putString(KEY_MEMBER_ID, memberId)
            .putString(KEY_MEMBER_NAME, memberName)
            .putString(KEY_FAMILY_ID, familyId)
            .putString(KEY_FAMILY_NAME, familyName)
            .apply()

        customApiUrl?.let { this.apiUrl = it }
    }

    fun clearSession() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "family_safety_secure_prefs"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_MEMBER_ID = "member_id"
        private const val KEY_MEMBER_NAME = "member_name"
        private const val KEY_FAMILY_ID = "family_id"
        private const val KEY_FAMILY_NAME = "family_name"
        private const val KEY_API_URL = "api_url"
        private const val KEY_FCM_TOKEN = "fcm_token"

        // 10.0.2.2 accesses host machine localhost from standard Android emulator
        const val DEFAULT_API_URL = "http://10.0.2.2:5000"
    }
}
