// cloudfunctions/getCloudHostingUrl/index.js
// 云函数：返回云托管服务的 WebSocket URL
// 云托管部署后，微信自动分配域名，格式为：
//   https://[envId]-[serviceName]-[随机].ap-shanghai.run.tcloudbase.com
// WebSocket URL 需要将 https 替换为 wss

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  // 云托管服务域名规则：
  // 容器服务部署后，微信自动生成域名
  // 格式: https://环境ID-服务名-xxx.region.run.tcloudbase.com
  //
  // 你需要在部署云托管后，从云开发控制台获取实际的服务域名
  // 然后硬编码在这里，或者通过云开发的容器服务 API 获取

  const ENV_ID = 'cloud1-d4gcfsku4e81556e0';  // 替换为你的环境 ID
  const SERVICE_NAME = 'scanbridge-server';
  const REGION = 'ap-shanghai';

  // 云托管 URL（部署后从控制台获取实际 URL 替换）
  const HTTP_URL = `https://${ENV_ID}-${SERVICE_NAME}-xxx.${REGION}.run.tcloudbase.com`;

  // WebSocket URL：https -> wss
  const WS_URL = HTTP_URL.replace('https://', 'wss://');

  return {
    url: WS_URL,
    httpUrl: HTTP_URL,
    envId: ENV_ID,
    serviceName: SERVICE_NAME,
  };
};
