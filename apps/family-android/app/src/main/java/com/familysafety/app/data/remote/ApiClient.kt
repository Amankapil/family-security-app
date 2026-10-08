package com.familysafety.app.data.remote

import android.content.Context
import com.familysafety.app.data.local.PreferencesManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {

    private var retrofit: Retrofit? = null
    private var cachedBaseUrl: String? = null

    lateinit var service: ApiService
        private set

    fun initialize(context: Context, prefs: PreferencesManager) {
        val currentBaseUrl = if (prefs.apiUrl.endsWith("/")) prefs.apiUrl else "${prefs.apiUrl}/"

        if (retrofit != null && cachedBaseUrl == currentBaseUrl) {
            return
        }

        cachedBaseUrl = currentBaseUrl

        val authInterceptor = Interceptor { chain ->
            val original = chain.request()
            val requestBuilder = original.newBuilder()

            prefs.deviceId?.let { requestBuilder.header("X-Device-Id", it) }
            prefs.deviceToken?.let { requestBuilder.header("X-Device-Token", it) }
            requestBuilder.header("Content-Type", "application/json")

            chain.proceed(requestBuilder.build())
        }

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()

        retrofit = Retrofit.Builder()
            .baseUrl(currentBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        service = retrofit!!.create(ApiService::class.java)
    }
}
