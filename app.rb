require 'bundler/setup'
Bundler.require(ENV['RACK_ENV'], :default)

require 'json'
require 'yaml'

K_ID = ENV['K_ID']
K_HOST = ENV['K_HOST']
K_USER = ENV['K_USER']
K_PASS = ENV['K_PASS']
K_REGION = ENV['K_REGION']

BASE_URL = "https://#{K_HOST}/api/v1"

DEFAULT_OPTS = {
  ssl_verifypeer: false,
  ssl_verifyhost: 0,
  userpwd: "#{K_USER}:#{K_PASS}"
}



# NOTE this is because we want minions to be square, so we want to
# quantize RAM to be equivalent with the CPU as an integer.
# We also mult. up because of float values
RAM_DIV = 1.0
CPU_MULT = 4.0 # 0.25 is lowest  -------- NOTE this is 3.6 because request RAM is now 90% (of 4.0 here)

# TODO
CPU_PARSER = proc do |cpu_str|
  (cpu_str =~ /m/ ? cpu_str.to_f / 1000 : cpu_str.to_i) * CPU_MULT
end

RAM_PARSER = proc do |ram_str| # it's quantized to GB, so it should always be reported as so... easy int conversion
  div = case ram_str[/\d+(M|G)i/][$1]
  when 'M'
    1024
  when 'G'
    1
  end
  ram_str.to_f / div / RAM_DIV
end



class App < Sinatra::Base
  get '/' do
    send_file 'static/index.html'
  end

  get '/static/:file' do
    send_file "static/#{params[:file]}"
  end

  get '/data.json' do
    content_type :json

    resp = Typhoeus.get("#{BASE_URL}/nodes", DEFAULT_OPTS)
    nodes = JSON.parse(resp.body)['items']

    namespace = params['namespace'] ? params['namespace'] : 'default'

    resp = Typhoeus.get("#{BASE_URL}/namespaces/#{namespace}/events", DEFAULT_OPTS)
    events = JSON.parse(resp.body)['items']
    events.sort_by! {|event| Time.parse(event['lastTimestamp']) }

    minions = [
      # {
      #   minion_ram: 2,
      #   pods: [
      #     {
      #       limits: {
      #         cpu: 1,
      #         ram: 1
      #       },
      #       requests: {
      #         cpu: 0.01,
      #         ram: 0.01
      #       }
      #     }
      #   ]
      # }
    ]

    nodes.each do |node|
      node_name = node['metadata']['name']

      # TODO
      ram = node['status']['capacity']['cpu'].to_i * CPU_MULT

      req_opts = DEFAULT_OPTS.merge params: {fieldSelector: "spec.nodeName=#{node_name}"}
      resp = Typhoeus.get("#{BASE_URL}/pods", req_opts)
      pods = JSON.parse(resp.body)['items']

      pods = pods.map do |pod|
        begin
          # NOTE ! ! !
          # we only want containers that have request at least 1/3 its limit... weird constraint, but basically means "only containers with basically > 0 request"
          # CPU doesn't matter in our case...
          # containers = pod['spec']['containers'].select do |container|
          #   req_ram = RAM_PARSER.call(container['resources']['requests']['memory'])
          #   lim_ram = RAM_PARSER.call(container['resources']['limits']['memory'])
          #
          #   req_ram > lim_ram / 3.0
          # end

          containers = pod['spec']['containers']

          cpu_req = containers.map {|c| CPU_PARSER.call c['resources']['requests']['cpu'] }.reduce(:+)
          ram_req = containers.map {|c| RAM_PARSER.call c['resources']['requests']['memory'] }.reduce(:+)
          cpu_lim = containers.map {|c| CPU_PARSER.call c['resources']['limits']['cpu'] }.reduce(:+)

          ram_lim = ram_req

          # TODO .....
          # if pod['spec']['volumes'].find {|vol| vol.has_key?('awsElasticBlockStore') }
          #   # ram_lim = (ram_req * 1.1111111111111112).ceil # cuz request is 90%
          #   ram_lim = (ram_req * 1.1111111111111112).floor
          # end

          {
            name: pod['metadata']['name'],
            namespace: pod['metadata']['namespace'],

            status: pod['status']['phase'],

            containers: containers,

            limits: {
              cpu: cpu_lim,
              ram: ram_lim
            },
            requests: {
              cpu: cpu_req,
              ram: ram_req
            }
          }
        rescue
          next
        end
      end.compact

      minions << {
        name: node_name,
        ready: node['status']['conditions'].find {|c| c['type'] == 'Ready' }['status'] == 'True',

        labels: node['metadata']['labels'],

        ram: ram,
        pods: pods
      }
    end

    {
      nodes: minions,
      events: events
    }.to_json
  end

end
