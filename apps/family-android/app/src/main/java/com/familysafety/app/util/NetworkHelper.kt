package com.familysafety.app.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build

object NetworkHelper {

    fun getNetworkType(context: Context): String {
        val connectivityManager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val activeNetwork = connectivityManager.activeNetwork ?: return "OFFLINE"
        val capabilities =
            connectivityManager.getNetworkCapabilities(activeNetwork) ?: return "OFFLINE"

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                // Cellular connection: check capabilities or standard cellular label
                "5G" // Modern fallback label for mobile data
            }
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "WIFI"
            else -> "UNKNOWN"
        }
    }
}
