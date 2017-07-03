var RESOURCE_MULT = 1000,
    MARGIN_PX = 10,
    INNER_MARGIN_PX = 0;
    // SQUARE_X2_SIDE_MULT = 1.4142135623730951; // #math

var MIN_HUE = 170,
    MAX_HUE = 280,
    NAMESPACE_HUES = {};

var svg = d3.select("svg"),
    loader = d3.select("#loader"),
    container = document.getElementById("container");




var activeNamespace;




getAndRender();
setInterval(getAndRender, 5000);

function getAndRender() {
  loader.style("opacity", 1);

  queryStr = activeNamespace ? "?namespace=" + activeNamespace : "";

  d3.json("data.json" + queryStr, function(error, json) {
    if (error) {
      console.warn(error);
    } else {
      render(json);
    }
    loader.style("opacity", 0);
  });
}

function render(json) {
  var minions = json.nodes,
      events = json.events,
      svgW = svg.node().getBoundingClientRect().width,//container.offsetWidth,
      svgH = svg.node().getBoundingClientRect().height;// container.offsetHeight; // make it long

  // Clear SVG
  svg.selectAll("*").remove();

  var mBlocks = minions.map(function(m) {

    var area = m.ram * 2 * RESOURCE_MULT,// * 2,  // x2 because minions technically can hold double capacity due to our req/lim strategy
        sideLen = Math.ceil(Math.sqrt(area)); // + 2 because it has to be bigger than max pod size

    // used below
    m.area = sideLen * 2;

    m.iw = sideLen;
    m.ih = sideLen;
    m.bw = sideLen + INNER_MARGIN_PX * 2;
    m.bh = sideLen + INNER_MARGIN_PX * 2;
    m.w = m.iw + MARGIN_PX * 2;
    m.h = m.ih + MARGIN_PX * 2 + 14;
    return m;
  });

  mBlocks.sort(function(a,b) { return (b.h > a.h); }); // sort inputs for best results



  // var maxHeight = mBlocks.
  //     totalArea = mBlocks.reduce(function(sum, m) { return sum + m.area; }, 0),
  //     svgW = svg.node().getBoundingClientRect().width,
  //     svgH = totalArea / svgW;
  //
  // // Set SVG height
  // svg.attr("height", svgH);



  var packer = new Packer(svgW, svgH);
  packer.fit(mBlocks);

  mBlocks = mBlocks.filter(function(b) {
    return b.fit;
  });

  pBlocks = mBlocks.reduce(function(a, m) {
    // var pods = m.pods.filter(function(p) {
    //   return p.limits.cpu; // TODO wtf is going on?
    // })
    var pods = m.pods.map(function(p) {

      var hue = NAMESPACE_HUES[p.namespace];
      hue = hue || Math.round(Math.random() * 360);
      NAMESPACE_HUES[p.namespace] = hue;

      // http://www.algebra.com/algebra/homework/Rectangles/Rectangles.faq.question.530552.html
      var cpu = p.limits.cpu,
          ram = p.limits.ram,
          area = (cpu + ram) * RESOURCE_MULT,
          unit = Math.sqrt(area / (cpu * ram)),
          w = unit * cpu,
          h = unit * ram;





      var maxw = Math.min(w, m.iw);
      if (maxw < w) {
        w = maxw;
        h = area / w;
      }
      var maxh = Math.min(h, m.ih);
      if (maxh < h) {
        h = maxh;
        h = area / h;
      }




      return {
        hue: hue,

        name: p.name,
        namespace: p.namespace,
        status: p.status,

        containers: p.containers,

        pw: m.iw,
        ph: m.ih,
        px: m.fit.x,
        py: m.fit.y,
        w: Math.round(w),
        h: Math.round(h)
      };
    });

    pods.sort(function(a,b) { return (b.h < a.h); }); // sort inputs for best results

    var podPacker = new Packer(m.iw, m.ih);
    podPacker.fit(pods);





    var unfitPods = pods.filter(function(pod) {
      return !pod.fit;
    });
    pods = pods.filter(function(pod) {
      return pod.fit;
    });

    podPacker = new Packer(m.iw, m.ih);
    podPacker.fit(unfitPods);



    var moreUnfitPods = unfitPods.filter(function(pod) {
      return !pod.fit;
    });
    unfitPods = unfitPods.filter(function(pod) {
      return pod.fit;
    });
    podPacker = new Packer(m.iw, m.ih);
    podPacker.fit(moreUnfitPods);



    // Inverse X,Y
    unfitPods.forEach(function(pod) {
      if (pod.fit) {
        pod.fit.x = pod.pw - pod.w - pod.fit.x;
        pod.fit.y = pod.ph - pod.h - pod.fit.y;
      }
    });

    // Inverse Y
    moreUnfitPods.forEach(function(pod) {
      if (pod.fit) {
        pod.fit.y = pod.ph - pod.h - pod.fit.y;
      }
    });



    return a.concat(pods).concat(unfitPods).concat(moreUnfitPods);
  }, []);

  var gEnter = svg.selectAll("g")
                  .data(mBlocks)
                  .enter()
                  .append("g");

  var pgEnter = svg.selectAll("g.pod")
                   .data(pBlocks)
                   .enter()
                   .append("g")
                   .attr("class", "pod");



  var eventsDiv = d3.select("#events"),
      userIsScrolling = !(eventsDiv.node().scrollTop == 0 || eventsDiv.node().scrollTop == eventsDiv.node().scrollHeight);

  eventsDiv.selectAll("*").remove();

  var eventsEnter = eventsDiv
                  .selectAll("div")
                  .data(events)
                  .enter()
                  .append("div");

  var eventP = eventsEnter.append("p")
                          .attr("style", "margin: 0")

  eventP.append("span")
                            .text(function(d) {
                              return d.lastTimestamp;
                            })

  eventP.append("span")
                            .attr("style", "margin-left: 15px")
                            .text(function(d) {
                              return d.involvedObject.name;
                            })
                            .style("color", function(d) {
                              var namespace;
                              if (d.involvedObject.kind == 'Pod') {
                                namespace = d.involvedObject.name.substring(0, 18); // TODO ---------------------------------
                              }

                              var hue = namespace ? NAMESPACE_HUES[namespace] : 0,
                                  sat = namespace ? 60 : 0;

                              return "hsla(" + hue + "," + sat + "%,70%,1)"
                            });

  eventP.append("span")
                            .attr("style", "margin-left: 15px")
                            .text(function(d) {
                              return d.count;
                            })

    eventsEnter.append("p")
          .attr("style", "margin: 4px 0 20px 0")
          .text(function(d) {
            return d.message;
          })


  if (!userIsScrolling) {
    eventsDiv.node().scrollTop = eventsDiv.node().scrollHeight;
  }



  // Empty container rectangle (for margin)
  gEnter.append("rect")
        .attr("width", function(d) { return d.w })
        .attr("height", function(d) { return d.h })
        .attr("x", function(d) { return d.fit.x })
        .attr("y", function(d) { return d.fit.y })
        .style("fill", "none")
        .style("stroke", "none");

  // Minion name
  gEnter.append("text")
        .attr("x", function(d) {
          return d.fit.x + MARGIN_PX;
        })
        .attr("y", function(d) {
          return + d.fit.y + d.bh + MARGIN_PX * 2;
        })
        .style("font-size", "0.5em")
        .style("opacity", "1")
        .text(function(d) { return d.name.substring(0, 17) });

  // Label
  gEnter.append("text")
        .attr("x", function(d) {
          return d.fit.x + MARGIN_PX;
        })
        .attr("y", function(d) {
          return + d.fit.y + d.bh + MARGIN_PX * 3;
        })
        .style("font-size", "0.5em")
        .style("opacity", "1")
        .text(function(d) {
          return 'inac: ' + d.labels['inactive'] + ', evac: ' + d.labels['evacuating'];
        });

  // Minion rectangle
  gEnter.append("rect")
        .attr("width", function(d) { return d.bw })
        .attr("height", function(d) { return d.bh })
        .attr("x", function(d) { return d.fit.x + MARGIN_PX })
        .attr("y", function(d) { return d.fit.y + MARGIN_PX })
        // .attr("fill", function(d) {
        //   return d.ready ? "none" : "rgba(255,0,0,0.1)";
        // })
        .attr("fill", "none")
        .attr("stroke", function(d) {
          return d.ready ? "rgba(0,0,0,0.1)" : "rgba(255,0,0,1)";
        })

  // Minion "extra capacity" overlay
  // gEnter.append("rect")
  //       .attr("width", function(d) { return d.iw })
  //       .attr("height", function(d) { return d.ih / 2 })
  //       .attr("x", function(d) { return d.fit.x + MARGIN_PX })
  //       .attr("y", function(d) { return d.fit.y + (d.ih / 2) + MARGIN_PX })
  //       .attr("fill", function(d) {
  //         return d.ready ? "rgba(0,0,0,0.05)" : "none";
  //       })
  //       .style("stroke", "none");

  // Pod rectangle
  var podRect = pgEnter.append("rect")
                       .attr("width", function(d) { return d.w })
                       .attr("height", function(d) { return d.h })
                       .attr("x", function(d) {
                         return d.px + (d.fit ? d.fit.x : 0) + MARGIN_PX + INNER_MARGIN_PX; // TODO ! ! ! ! ! ! ! ! ! !! !
                       })
                       .attr("y", function(d) {
                         return d.py + (d.fit ? d.fit.y : d.ph) + MARGIN_PX + INNER_MARGIN_PX; // TODO ! ! ! ! ! ! ! ! ! !! !
                       })
                       .attr("fill", function(d) { return "hsla(" + d.hue + ",70%,50%,0.3)" })
                       .attr("stroke", function(d) { return "hsla(" + d.hue + ",70%,50%,0.7)" })
                       .attr("data:namespace", function(d) {
                         return d.namespace;
                       });

  pgEnter.append("text")
        .attr("x", function(d) {
          if (d.fit)
            return d.px + d.fit.x + d.w / 2 + MARGIN_PX + INNER_MARGIN_PX;
        })
        .attr("y", function(d) {
          if (d.fit)
            return d.py + d.fit.y + d.h / 2 + MARGIN_PX + INNER_MARGIN_PX;
        })
        .style("font-size", "0.6em")
        .style("text-anchor", "middle")
        .attr("fill", function(d) {
          return "hsla(" + d.hue + ",80%,40%,1)";
        })
        .style("font-style", function(d) {
          if (d.status != 'Running') {
            return 'italic';
          }
        })
        .text(function(d) {
          if (d.h > 10 && d.w > 10) {
            var name = d.containers[0].name;
            return name;
            // return (name.length > 10) ? name.substring(0, 7) + '..' : name;
          }
        });


  podRect.on('click', function(d) {
    activeNamespace = d.namespace;
    d3.event.stopPropagation();
    getAndRender();
  });





  // // Pod name
  // pgEnter.append("text")
  //        .attr("x", function(d) { return d.px + d.fit.x })
  //        .attr("y", function(d) { return d.py + (d.h / 2) + d.fit.y })
  //        .attr("dx", "1em")
  //        .attr("dy", "1em")
  //        .style("font-size", "10px")
  //        .text(function(d) { return d.name });
}
